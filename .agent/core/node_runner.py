from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import stat
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CORE_DIR = Path(__file__).resolve().parent
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))

from llm_adapter import invoke_llm
from policies import PHASES, WORK_PHASES, GROWTH_PHASES, node_dir, normalize_node_id, is_protected_agent_path
from schemas import ALLOWED_STATUSES, markdown_for_output, validate_phase_output


def main(argv: list[str] | None = None) -> int:
    repo_root = find_repo_root(Path.cwd())
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "help":
        parser.print_help()
        return 0
    if args.command == "self-test":
        return print_result(run_self_test(repo_root))
    if args.command == "health":
        return print_result(run_health(repo_root))
    if args.command == "next":
        task = "Continue development toward the current project goal. Choose the next small safe increment."
        return run_work_command(repo_root, task, argparse.Namespace(run=None, invalidate=False, invalidate_phase=[], from_phase=None))
    if args.command == "ack-start":
        return run_ack_start_command(repo_root, args.task)
    if args.command == "ack-finish":
        return run_ack_finish_command(repo_root, args)
    if args.command == "run":
        task = args.task_flag or args.task
        if not task:
            parser.error("run requires a task argument or --task")
        return run_work_command(repo_root, task, args)
    if args.command == "context":
        return run_context_command(repo_root, args.task, args.phase)
    if args.command == "packet":
        return run_packet_command(repo_root, args.task, args.phase)
    if args.command == "reflect":
        return run_reflect_command(repo_root, args.run)
    if args.command == "resume":
        return print_result(run_resume(repo_root, args.run, args.response))

    parser.print_help()
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog=".agent/bin/agent")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("help")
    sub.add_parser("self-test")
    sub.add_parser("health")
    sub.add_parser("next")

    ack_start = sub.add_parser("ack-start")
    ack_start.add_argument("task")

    ack_finish = sub.add_parser("ack-finish")
    ack_finish.add_argument("--run")
    ack_finish.add_argument("--task", default="")
    ack_finish.add_argument("--status", default="done")
    ack_finish.add_argument("--summary", default="Work finished.")
    ack_finish.add_argument("--checks", default="")

    run = sub.add_parser("run")
    run.add_argument("task", nargs="?")
    run.add_argument("--task", dest="task_flag")
    run.add_argument("--run")
    run.add_argument("--invalidate", action="store_true")
    run.add_argument("--invalidate-phase", action="append", default=[])
    run.add_argument("--from-phase")

    context = sub.add_parser("context")
    context.add_argument("task")
    context.add_argument("--phase", default="plan")

    packet = sub.add_parser("packet")
    packet.add_argument("task")
    packet.add_argument("--phase", default="plan")

    reflect = sub.add_parser("reflect")
    reflect.add_argument("--run", required=True)

    resume = sub.add_parser("resume")
    resume.add_argument("--run", required=True)
    resume.add_argument("--response", required=True)
    return parser


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists() or (candidate / ".agent").exists():
            return candidate
    return current


def load_config(repo_root: Path) -> dict[str, Any]:
    with (repo_root / ".agent" / "config.json").open("r", encoding="utf-8") as fh:
        return json.load(fh)


def new_run_id(prefix: str = "run") -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{prefix}-{stamp}-{os.getpid()}"


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n", encoding="utf-8")


def load_node_module(repo_root: Path, node_id: str):
    node_id = normalize_node_id(node_id)
    core = repo_root / ".agent" / "core"
    if str(core) not in sys.path:
        sys.path.insert(0, str(core))
    self_path = node_dir(repo_root, node_id) / "self.py"
    spec = importlib.util.spec_from_file_location(f"agent_node_{node_id}", self_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load node self-program: {self_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def phase_dir(run_dir: Path, phase: str) -> Path:
    return run_dir / "phases" / phase


def build_phase_input(
    repo_root: Path,
    run_dir: Path,
    run_id: str,
    node_id: str,
    task: str,
    phase: str,
    command: str,
    requested_phase: str | None,
    prior_outputs: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    return {
        "repo_root": str(repo_root),
        "run_dir": str(run_dir),
        "run_id": run_id,
        "node_id": node_id,
        "task": task,
        "phase": phase,
        "command": command,
        "requested_phase": requested_phase,
        "prior_outputs": prior_outputs,
        "config": config,
    }


def execute_phase(
    repo_root: Path,
    run_dir: Path,
    run_id: str,
    node_id: str,
    task: str,
    phase: str,
    command: str,
    requested_phase: str | None,
    prior_outputs: dict[str, Any],
    config: dict[str, Any],
    invalidate: bool = False,
) -> tuple[dict[str, Any], bool]:
    pdir = phase_dir(run_dir, phase)
    pdir.mkdir(parents=True, exist_ok=True)
    input_data = build_phase_input(repo_root, run_dir, run_id, node_id, task, phase, command, requested_phase, prior_outputs, config)
    input_text = stable_json(input_data)
    input_hash = sha256_text(input_text)
    input_path = pdir / "input.json"
    hash_path = pdir / "input.hash"
    output_path = pdir / "output.json"
    done_path = pdir / "done"

    if (
        not invalidate
        and done_path.exists()
        and hash_path.exists()
        and output_path.exists()
        and hash_path.read_text(encoding="utf-8") == input_hash
    ):
        return read_json(output_path), True

    write_json(input_path, input_data)
    hash_path.write_text(input_hash, encoding="utf-8")
    before = snapshot_protected(repo_root)
    try:
        module = load_node_module(repo_root, node_id)
        raw_output = module.handle_phase(phase, input_data)
        output = validate_phase_output(raw_output, phase)
    except Exception as exc:
        output = {
            "phase": phase,
            "node_id": node_id,
            "status": "failed",
            "summary": f"Phase raised {type(exc).__name__}.",
            "failure_reason": str(exc),
        }

    after = snapshot_protected(repo_root)
    unauthorized = unauthorized_protected_changes(before, after, phase, node_id)
    if unauthorized:
        output = {
            "phase": phase,
            "node_id": node_id,
            "status": "failed",
            "summary": "Protected agent-system files changed outside an allowed phase.",
            "failure_reason": "Unauthorized protected path mutation.",
            "changed_files": unauthorized,
        }

    output["run_id"] = run_id
    output = validate_phase_output(output, phase)
    write_json(output_path, output)
    (pdir / "output.md").write_text(markdown_for_output(output), encoding="utf-8")
    done_path.write_text("done\n", encoding="utf-8")
    append_node_log(repo_root, node_id, run_id, phase, output)
    return output, False


def snapshot_protected(repo_root: Path) -> dict[str, str | None]:
    roots = [
        repo_root / ".agent" / "core",
        repo_root / ".agent" / "system",
        repo_root / ".agent" / "bin" / "agent",
        repo_root / ".agent" / "nodes",
    ]
    paths: list[Path] = []
    for root in roots:
        if root.is_file():
            paths.append(root)
        elif root.is_dir():
            for path in root.rglob("*"):
                if path.is_file() and is_protected_agent_path(path, repo_root):
                    paths.append(path)
    snap: dict[str, str | None] = {}
    for path in sorted(set(paths)):
        rel = path.resolve().relative_to(repo_root.resolve()).as_posix()
        snap[rel] = sha256_text(path.read_text(encoding="utf-8", errors="replace"))
    return snap


def unauthorized_protected_changes(
    before: dict[str, str | None],
    after: dict[str, str | None],
    phase: str,
    node_id: str,
) -> list[str]:
    changed = sorted(key for key in set(before) | set(after) if before.get(key) != after.get(key))
    if not changed:
        return []
    if phase != "mutate":
        return changed
    if node_id == "root":
        return []
    own_prefix = f".agent/nodes/{node_id}/"
    return [path for path in changed if not path.startswith(own_prefix)]


def append_node_log(repo_root: Path, node_id: str, run_id: str, phase: str, output: dict[str, Any]) -> None:
    logs = node_dir(repo_root, node_id) / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    line = {
        "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "run_id": run_id,
        "node_id": node_id,
        "phase": phase,
        "status": output.get("status"),
        "summary": output.get("summary"),
    }
    with (logs / f"{run_id}.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(line, sort_keys=True, ensure_ascii=True) + "\n")


def run_phases(
    repo_root: Path,
    task: str,
    phases: list[str],
    command: str,
    requested_phase: str | None = None,
    run_id: str | None = None,
    invalidate_all: bool = False,
    invalidate_phases: list[str] | None = None,
    from_phase: str | None = None,
) -> dict[str, Any]:
    config = load_config(repo_root)
    node_id = normalize_node_id(config.get("default_node", "root"))
    run_id = run_id or new_run_id("run")
    run_dir = repo_root / ".agent" / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    prior_outputs: dict[str, Any] = {}
    invalidate_set = set(invalidate_phases or [])
    recompute = invalidate_all
    for phase in phases:
        if from_phase and phase == from_phase:
            recompute = True
        invalidate = recompute or phase in invalidate_set
        output, reused = execute_phase(
            repo_root,
            run_dir,
            run_id,
            node_id,
            task,
            phase,
            command,
            requested_phase,
            prior_outputs,
            config,
            invalidate,
        )
        output["_reused"] = reused
        prior_outputs[phase] = output
        status = output.get("status")
        if phase == "route" and status == "routed":
            target = output.get("target_node", "root")
            if target != node_id:
                target_dir = node_dir(repo_root, str(target))
                if not target_dir.exists():
                    output["status"] = "blocked"
                    output["blocked_reason"] = f"target node {target!r} does not exist"
                    return output
                node_id = normalize_node_id(str(target))
            continue
        if status in {"needs_llm", "blocked", "failed"}:
            return output
    return prior_outputs[phases[-1]]


def run_work_command(repo_root: Path, task: str, args: argparse.Namespace) -> int:
    output = run_phases(
        repo_root,
        task,
        WORK_PHASES,
        "run",
        requested_phase=None,
        run_id=args.run,
        invalidate_all=args.invalidate,
        invalidate_phases=args.invalidate_phase,
        from_phase=args.from_phase,
    )
    return print_result(output)


def run_context_command(repo_root: Path, task: str, requested_phase: str) -> int:
    output = run_phases(repo_root, task, ["receive", "classify", "route", "context"], "context", requested_phase=requested_phase)
    return print_result(output)


def run_ack_start_command(repo_root: Path, task: str) -> int:
    output = run_phases(repo_root, task, ["receive", "classify", "route", "context"], "ack-start", requested_phase="plan")
    run_id = output.get("run_id")
    if run_id:
        run_dir = repo_root / ".agent" / "runs" / str(run_id)
        write_json(run_dir / "ack-start.json", {
            "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "task": task,
            "status": output.get("status"),
            "context_path": output.get("context_path"),
            "packet_path": output.get("packet_path"),
            "finish_command": f".agent/bin/agent ack-finish --run {run_id} --status done --summary \"<summary>\"",
        })
        output["summary"] = "Agent system acknowledged start; bounded context packet is available."
        output["next_steps"] = [f".agent/bin/agent ack-finish --run {run_id} --status done --summary \"<summary>\""]
    return print_result(output)


def run_ack_finish_command(repo_root: Path, args: argparse.Namespace) -> int:
    run_id = args.run or new_run_id("ack")
    run_dir = repo_root / ".agent" / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    record = {
        "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "run_id": run_id,
        "task": args.task,
        "status": args.status,
        "summary": args.summary,
        "checks": args.checks,
    }
    write_json(run_dir / "ack-finish.json", record)
    output = {
        "phase": "report",
        "node_id": "root",
        "status": "ok",
        "run_id": run_id,
        "summary": "Agent system acknowledged finish.",
        "artifacts": [str(run_dir / "ack-finish.json")],
    }
    append_node_log(repo_root, "root", run_id, "report", output)
    return print_result(output)


def run_packet_command(repo_root: Path, task: str, requested_phase: str) -> int:
    if requested_phase == "context":
        phases = ["receive", "classify", "route", "context"]
    elif requested_phase in WORK_PHASES:
        phases = WORK_PHASES[: WORK_PHASES.index(requested_phase) + 1]
    elif requested_phase in GROWTH_PHASES:
        phases = ["receive", "classify", "route", "context", requested_phase]
    else:
        raise SystemExit(f"unknown phase: {requested_phase}")
    output = run_phases(repo_root, task, phases, "packet", requested_phase=requested_phase)
    return print_result(output)


def run_reflect_command(repo_root: Path, run_id: str) -> int:
    task = f"Reflect on run {run_id}."
    output = run_phases(repo_root, task, ["reflect"], "reflect", requested_phase="reflect", run_id=run_id, invalidate_all=True)
    return print_result(output)


def run_resume(repo_root: Path, run_id: str, response_file: str) -> dict[str, Any]:
    response_path = Path(response_file)
    if not response_path.is_absolute():
        response_path = (Path.cwd() / response_path).resolve()
    if not response_path.exists():
        return {"status": "failed", "summary": "response file does not exist", "failure_reason": str(response_path)}
    run_dir = repo_root / ".agent" / "runs" / run_id
    if not run_dir.exists():
        return {"status": "failed", "summary": "run does not exist", "failure_reason": run_id}
    responses = run_dir / "responses"
    responses.mkdir(parents=True, exist_ok=True)
    dest = responses / f"response-{int(time.time())}.md"
    dest.write_text(response_path.read_text(encoding="utf-8"), encoding="utf-8")
    return {
        "status": "blocked",
        "summary": "Response recorded. Resume application is intentionally minimal in this seed.",
        "run_id": run_id,
        "response_path": str(dest),
        "next_steps": [f"Inspect {dest}", "Run from the next phase explicitly when the node supports response application."],
    }


def required_files() -> list[str]:
    return [
        ".agent/bin/agent",
        ".agent/config.json",
        ".agent/project-goal.md",
        ".agent/core/node_runner.py",
        ".agent/core/llm_adapter.py",
        ".agent/core/policies.py",
        ".agent/core/schemas.py",
        ".agent/nodes/root/manifest.md",
        ".agent/nodes/root/prompt.md",
        ".agent/nodes/root/self.py",
        ".agent/nodes/root/state.md",
        ".agent/nodes/root/children.md",
        ".agent/nodes/root/memory.md",
        ".agent/nodes/root/metrics.md",
        ".agent/system/constitution.md",
        ".agent/system/phase-rules.md",
        ".agent/system/project-development.md",
        ".agent/system/mutation-rules.md",
        ".agent/system/core-change-rules.md",
        ".agent/system/idempotency.md",
        ".agent/system/ambient-agent-protocol.md",
        "AGENTS.md",
        "CLAUDE.md",
    ]


def required_dirs() -> list[str]:
    return [
        ".agent/nodes/root/logs",
        ".agent/nodes/root/reflections",
        ".agent/nodes/root/proposals",
        ".agent/nodes/root/votes",
        ".agent/runs",
    ]


def run_health(repo_root: Path) -> dict[str, Any]:
    missing = [path for path in required_files() if not (repo_root / path).exists()]
    missing_dirs = [path for path in required_dirs() if not (repo_root / path).is_dir()]
    config_ok = True
    try:
        load_config(repo_root)
    except Exception:
        config_ok = False
    status = "ok" if not missing and not missing_dirs and config_ok else "failed"
    return {
        "status": status,
        "summary": "health: ok" if status == "ok" else "health: failed",
        "missing_files": missing,
        "missing_dirs": missing_dirs,
        "config_ok": config_ok,
    }


def run_self_test(repo_root: Path) -> dict[str, Any]:
    checks: list[str] = []

    health = run_health(repo_root)
    if health["status"] != "ok":
        return {"status": "failed", "summary": "self-test failed health", "checks": checks, "failure_reason": health}
    checks.append("required files and directories exist")

    for directory in required_dirs():
        base = repo_root / directory
        if not (base / ".gitkeep").exists() or not (base / ".gitignore").exists():
            return {"status": "failed", "summary": "self-test failed artifact hygiene", "failure_reason": directory}
    checks.append("artifact .gitkeep and .gitignore files exist")

    mode = (repo_root / ".agent/bin/agent").stat().st_mode
    if not (mode & stat.S_IXUSR):
        return {"status": "failed", "summary": "self-test failed executable bit", "failure_reason": ".agent/bin/agent"}
    checks.append("agent wrapper is executable")

    module = load_node_module(repo_root, "root")
    root_self = module.self_test(repo_root)
    if root_self.get("status") != "ok":
        return {"status": "failed", "summary": "self-test failed root self-test", "failure_reason": root_self}
    checks.append("root self.py imports and exposes required handlers")

    validate_phase_output({"phase": "context", "node_id": "root", "status": "ok", "summary": "valid"}, "context")
    try:
        validate_phase_output({"phase": "context", "node_id": "root", "status": "bogus", "summary": "bad"}, "context")
    except ValueError:
        checks.append("schemas reject invalid statuses")
    else:
        return {"status": "failed", "summary": "schema accepted invalid status"}

    temp_run = repo_root / ".agent" / "runs" / f"selftest-llm-{os.getpid()}"
    llm = invoke_llm(repo_root, temp_run, "self-test", "Self-test prompt")
    if llm.get("status") != "needs_llm" or not llm.get("prompt_path"):
        return {"status": "failed", "summary": "manual backend self-test failed", "failure_reason": llm}
    checks.append("manual llm backend writes packet")

    run_id = f"selftest-idem-{os.getpid()}"
    run_dir = repo_root / ".agent" / "runs" / run_id
    config = load_config(repo_root)
    first, reused1 = execute_phase(repo_root, run_dir, run_id, "root", "self-test idempotency", "receive", "self-test", None, {}, config)
    second, reused2 = execute_phase(repo_root, run_dir, run_id, "root", "self-test idempotency", "receive", "self-test", None, {}, config)
    if reused1 or not reused2 or first.get("summary") != second.get("summary"):
        return {"status": "failed", "summary": "phase idempotency self-test failed"}
    checks.append("phase idempotency reuses matching input")

    changed = unauthorized_protected_changes({"a": "1"}, {"a": "2"}, "context", "root")
    if not changed:
        return {"status": "failed", "summary": "protected-path mutation detection self-test failed"}
    checks.append("protected-path mutation detection works")

    for bad in ("../root", "a/b", "a\\b", ".", "..", ""):
        try:
            normalize_node_id(bad)
        except ValueError:
            continue
        return {"status": "failed", "summary": "node id normalization accepted invalid id", "failure_reason": bad}
    checks.append("node id normalization rejects traversal and separators")

    return {"status": "ok", "summary": "self-test: ok", "checks": checks}


def print_result(output: dict[str, Any]) -> int:
    status = output.get("status", "ok")
    print(f"status: {status}")
    if "run_id" in output:
        print(f"run_id: {output['run_id']}")
    if "phase" in output:
        print(f"phase: {output['phase']}")
    if "packet_path" in output and output["packet_path"]:
        print(f"packet: {output['packet_path']}")
    if "context_path" in output and output["context_path"]:
        print(f"context: {output['context_path']}")
    if status == "needs_llm":
        run_id = output.get("run_id", "<run-id>")
        print(f"resume: .agent/bin/agent resume --run {run_id} --response <file>")
    if output.get("summary"):
        print(output["summary"])
    if output.get("failure_reason"):
        print(f"failure: {output['failure_reason']}")
    if output.get("blocked_reason"):
        print(f"blocked: {output['blocked_reason']}")
    return 1 if status == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
