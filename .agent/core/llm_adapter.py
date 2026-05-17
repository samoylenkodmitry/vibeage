from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_config(repo_root: Path) -> dict[str, Any]:
    with (repo_root / ".agent" / "config.json").open("r", encoding="utf-8") as fh:
        return json.load(fh)


def invoke_llm(
    repo_root: Path,
    run_dir: Path,
    phase: str,
    prompt: str,
    backend_name: str | None = None,
) -> dict[str, Any]:
    config = load_config(repo_root)
    selected = backend_name or config.get("llm_backend", "manual")
    backends = config.get("llm_backends", {})
    backend = backends.get(selected)
    if not isinstance(backend, dict):
        raise ValueError(f"unknown llm backend: {selected}")

    backend_for_hash = {"name": selected, "config": backend}
    input_hash = _sha256_text(_stable_json(backend_for_hash) + "\n" + prompt)
    call_id = f"{phase}-{input_hash[:16]}"
    call_dir = run_dir / "llm-calls" / call_id
    call_dir.mkdir(parents=True, exist_ok=True)

    hash_path = call_dir / "input.hash"
    response_path = call_dir / "response.md"
    exit_code_path = call_dir / "exit-code"
    if hash_path.exists() and hash_path.read_text(encoding="utf-8") == input_hash and exit_code_path.exists():
        status = "ok" if response_path.exists() else "needs_llm"
        return {
            "backend": selected,
            "status": status,
            "prompt_path": str(call_dir / "prompt.md"),
            "response_path": str(response_path) if response_path.exists() else None,
            "summary": "Reused cached LLM call.",
            "call_id": call_id,
        }

    (call_dir / "backend.json").write_text(_stable_json(backend_for_hash) + "\n", encoding="utf-8")
    (call_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    (call_dir / "stdout.log").write_text("", encoding="utf-8")
    (call_dir / "stderr.log").write_text("", encoding="utf-8")
    hash_path.write_text(input_hash, encoding="utf-8")

    backend_type = backend.get("type")
    if backend_type == "manual":
        exit_code_path.write_text("0\n", encoding="utf-8")
        return {
            "backend": selected,
            "status": "needs_llm",
            "prompt_path": str(call_dir / "prompt.md"),
            "response_path": None,
            "summary": "Manual backend selected; packet written.",
            "call_id": call_id,
        }

    if backend_type != "command":
        exit_code_path.write_text("1\n", encoding="utf-8")
        raise ValueError(f"unsupported backend type: {backend_type}")

    command = backend.get("command")
    if not isinstance(command, list) or not all(isinstance(part, str) for part in command):
        exit_code_path.write_text("1\n", encoding="utf-8")
        raise ValueError("command backend requires a string-array command")

    prompt_file = str(call_dir / "prompt.md")
    expanded = [
        part.replace("{prompt_file}", prompt_file).replace("{prompt}", prompt)
        for part in command
    ]
    timeout = int(backend.get("timeout_seconds", 900))
    try:
        completed = subprocess.run(
            expanded,
            cwd=repo_root,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        (call_dir / "stdout.log").write_text(exc.stdout or "", encoding="utf-8")
        (call_dir / "stderr.log").write_text(exc.stderr or "timeout\n", encoding="utf-8")
        exit_code_path.write_text("124\n", encoding="utf-8")
        return {
            "backend": selected,
            "status": "failed",
            "prompt_path": prompt_file,
            "response_path": None,
            "summary": f"LLM command timed out after {timeout}s.",
            "call_id": call_id,
        }

    (call_dir / "stdout.log").write_text(completed.stdout, encoding="utf-8")
    (call_dir / "stderr.log").write_text(completed.stderr, encoding="utf-8")
    exit_code_path.write_text(f"{completed.returncode}\n", encoding="utf-8")
    if completed.returncode != 0:
        return {
            "backend": selected,
            "status": "failed",
            "prompt_path": prompt_file,
            "response_path": None,
            "summary": f"LLM command exited {completed.returncode}.",
            "call_id": call_id,
        }

    response_path.write_text(completed.stdout, encoding="utf-8")
    return {
        "backend": selected,
        "status": "ok",
        "prompt_path": prompt_file,
        "response_path": str(response_path),
        "summary": "LLM command completed.",
        "call_id": call_id,
    }
