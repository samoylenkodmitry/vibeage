from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from llm_adapter import invoke_llm

TASK_KINDS = {
    "product_development",
    "project_analysis",
    "verification",
    "agent_system_reflection",
    "agent_system_mutation",
    "unclear",
}

REQUIRED_PHASES = [
    "receive",
    "classify",
    "route",
    "context",
    "plan",
    "execute",
    "verify",
    "report",
    "reflect",
    "mutate",
    "compact",
]


def handle_phase(phase: str, input_data: dict[str, Any]) -> dict[str, Any]:
    handlers = {name: globals()[name] for name in REQUIRED_PHASES}
    if phase not in handlers:
        return out(input_data, phase, "failed", f"Unknown phase: {phase}", failure_reason=phase)
    return handlers[phase](input_data)


def receive(input_data: dict[str, Any]) -> dict[str, Any]:
    task = input_data.get("task", "").strip()
    return out(input_data, "receive", "ok", "Received developer task.", task=task)


def classify(input_data: dict[str, Any]) -> dict[str, Any]:
    task = input_data.get("task", "")
    lower = task.lower()
    broad = lower.strip() in {
        "continue development",
        "improve the project",
        "work on the next thing",
        "move this repo forward",
    } or "continue development toward the current project goal" in lower

    if any(token in lower for token in [".agent", "agent system", "root node", "node runner", "self.py", "mutation", "harness"]):
        kind = "agent_system_mutation" if any(token in lower for token in ["create", "modify", "seed", "bootstrap", "mutate"]) else "agent_system_reflection"
        confidence = "high"
    elif any(token in lower for token in ["test", "verify", "check", "ci", "lint", "typecheck"]):
        kind = "verification"
        confidence = "medium"
    elif any(token in lower for token in ["review", "analyze", "inspect", "audit", "summarize"]):
        kind = "project_analysis"
        confidence = "medium"
    elif task.strip():
        kind = "product_development"
        confidence = "medium"
    else:
        kind = "unclear"
        confidence = "low"

    return out(
        input_data,
        "classify",
        "ok",
        f"Classified task as {kind}.",
        task_kind=kind,
        confidence=confidence,
        broad_continue_development=broad,
        reason="Deterministic keyword classification; ambiguous development defaults to product_development.",
    )


def route(input_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "phase": "route",
        "node_id": input_data["node_id"],
        "status": "routed",
        "target_node": "root",
        "reason": "Root owns initial project development and no children exist.",
        "fallback": "root",
        "summary": "Routed to root.",
    }


def context(input_data: dict[str, Any]) -> dict[str, Any]:
    repo_root = Path(input_data["repo_root"])
    run_dir = Path(input_data["run_dir"])
    requested_phase = input_data.get("requested_phase") or "plan"
    assembled = assemble_context(repo_root, input_data)
    context_text = render_context(input_data, assembled)
    context_text = enforce_budget(context_text, int(input_data["config"].get("context_budget_chars", 60000)))
    context_path = run_dir / "context" / f"{requested_phase}.md"
    context_path.parent.mkdir(parents=True, exist_ok=True)
    context_path.write_text(context_text, encoding="utf-8")
    packet_path = write_packet(input_data, requested_phase, context_text, "context")
    return out(
        input_data,
        "context",
        "ok",
        "Assembled bounded live context.",
        context_path=str(context_path),
        packet_path=str(packet_path),
        artifacts=[str(context_path), str(packet_path)],
    )


def plan(input_data: dict[str, Any]) -> dict[str, Any]:
    return llm_phase(input_data, "plan", "Planning packet written.")


def execute(input_data: dict[str, Any]) -> dict[str, Any]:
    return llm_phase(input_data, "execute", "Execution packet written.")


def verify(input_data: dict[str, Any]) -> dict[str, Any]:
    repo_root = Path(input_data["repo_root"])
    checks = []
    required = [
        ".agent/config.json",
        ".agent/core/node_runner.py",
        ".agent/core/llm_adapter.py",
        ".agent/core/policies.py",
        ".agent/core/schemas.py",
        ".agent/bin/agent",
        ".agent/nodes/root/self.py",
    ]
    missing = [path for path in required if not (repo_root / path).exists()]
    checks.append({"name": "agent required files", "ok": not missing, "missing": missing})
    checks.append({"name": "agent wrapper executable", "ok": os.access(repo_root / ".agent/bin/agent", os.X_OK)})
    handlers_ok = all(callable(globals().get(name)) for name in REQUIRED_PHASES)
    checks.append({"name": "root phase handlers", "ok": handlers_ok})
    ok = all(check.get("ok") for check in checks)
    recommended = []
    classify_out = input_data.get("prior_outputs", {}).get("classify", {})
    if classify_out.get("task_kind") == "product_development":
        recommended.append("Run the project's existing checks appropriate to changed product files.")
    return out(
        input_data,
        "verify",
        "ok" if ok else "failed",
        "Verification completed." if ok else "Verification failed.",
        checks=checks,
        verification_summary="Safe deterministic agent-system checks ran.",
        next_steps=recommended,
        failure_reason=None if ok else "One or more deterministic checks failed.",
    )


def report(input_data: dict[str, Any]) -> dict[str, Any]:
    prior = input_data.get("prior_outputs", {})
    lines = []
    for phase in REQUIRED_PHASES:
        if phase in prior:
            item = prior[phase]
            lines.append(f"- {phase}: {item.get('status')} - {item.get('summary')}")
    report_path = Path(input_data["run_dir"]) / "report.md"
    report_path.write_text("# Run Report\n\n" + "\n".join(lines) + "\n", encoding="utf-8")
    return out(input_data, "report", "ok", "Report written.", artifacts=[str(report_path)])


def reflect(input_data: dict[str, Any]) -> dict[str, Any]:
    return llm_phase(input_data, "reflect", "Reflection packet written.")


def mutate(input_data: dict[str, Any]) -> dict[str, Any]:
    return out(input_data, "mutate", "ok", "No approved mutation proposals to apply.")


def compact(input_data: dict[str, Any]) -> dict[str, Any]:
    return out(input_data, "compact", "ok", "No compaction needed in seed implementation.")


def self_test(repo_root: Path) -> dict[str, Any]:
    missing = [name for name in REQUIRED_PHASES if not callable(globals().get(name))]
    if missing:
        return {"status": "failed", "summary": "missing phase handlers", "missing": missing}
    return {"status": "ok", "summary": "root self-test ok"}


def llm_phase(input_data: dict[str, Any], phase: str, summary: str) -> dict[str, Any]:
    context_text = read_context_for_phase(input_data, phase)
    packet_path = write_packet(input_data, phase, context_text, phase)
    result = invoke_llm(Path(input_data["repo_root"]), Path(input_data["run_dir"]), phase, packet_path.read_text(encoding="utf-8"))
    status = "needs_llm" if result["status"] == "needs_llm" else result["status"]
    return out(
        input_data,
        phase,
        status,
        result.get("summary", summary),
        packet_path=str(packet_path),
        llm_call=result,
        resume_hint=f".agent/bin/agent resume --run {input_data['run_id']} --response <file>" if status == "needs_llm" else None,
    )


def out(input_data: dict[str, Any], phase: str, status: str, summary: str, **extra: Any) -> dict[str, Any]:
    result = {
        "phase": phase,
        "node_id": input_data.get("node_id", "root"),
        "status": status,
        "summary": summary,
    }
    for key, value in extra.items():
        if value is not None:
            result[key] = value
    return result


def assemble_context(repo_root: Path, input_data: dict[str, Any]) -> dict[str, Any]:
    config = input_data["config"]
    limits = config.get("context_limits", {})
    return {
        "project_goal": read_text_if_exists(repo_root / config.get("project_goal_path", ".agent/project-goal.md")),
        "git_branch": run_cmd(repo_root, ["git", "branch", "--show-current"]),
        "git_status_short": cap_lines(run_cmd(repo_root, ["git", "status", "--short"]), int(limits.get("git_status_files", 200))),
        "repo_tree": repo_tree(repo_root, config, int(limits.get("repo_tree_entries", 300))),
        "manifest_files": detect_manifest_files(repo_root, config),
        "command_candidates": detect_commands(repo_root),
        "task_search": task_search(repo_root, input_data.get("task", ""), config),
        "root_manifest": read_text_if_exists(repo_root / ".agent/nodes/root/manifest.md"),
        "root_children": read_text_if_exists(repo_root / ".agent/nodes/root/children.md"),
        "agents_md": read_agents(repo_root, int(limits.get("agents_md_full_dump_max_chars", 12000))),
        "last_report": last_report(repo_root),
    }


def render_context(input_data: dict[str, Any], assembled: dict[str, Any]) -> str:
    classify_out = input_data.get("prior_outputs", {}).get("classify", {})
    parts = [
        "# Assembled Live Context",
        "",
        f"Task: {input_data.get('task', '')}",
        f"Task kind: {classify_out.get('task_kind', 'unknown')}",
        f"Run ID: {input_data.get('run_id')}",
        f"Active node: {input_data.get('node_id')}",
        "",
    ]
    for key, value in assembled.items():
        parts.extend([f"## {key}", "", stringify(value), ""])
    return "\n".join(parts)


def write_packet(input_data: dict[str, Any], target_phase: str, context_text: str, purpose: str) -> Path:
    run_dir = Path(input_data["run_dir"])
    packet_dir = run_dir / "packets"
    packet_dir.mkdir(parents=True, exist_ok=True)
    packet_path = packet_dir / f"{target_phase}.md"
    classify_out = input_data.get("prior_outputs", {}).get("classify", {})
    task_kind = classify_out.get("task_kind", "unknown")
    broad = classify_out.get("broad_continue_development", False)
    config = input_data["config"]
    allowed_scope, forbidden_scope = scope_for(task_kind)
    lines = [
        "# Work Packet",
        "",
        f"Task: {input_data.get('task', '')}",
        f"Task kind: {task_kind}",
        f"Phase: {target_phase}",
        f"Packet purpose: {purpose}",
        f"Active node: {input_data.get('node_id')}",
        f"Run ID: {input_data.get('run_id')}",
        f"Current backend mode: {config.get('llm_backend', 'manual')}",
        "",
        "## Project Goal",
        read_text_if_exists(Path(input_data["repo_root"]) / config.get("project_goal_path", ".agent/project-goal.md")),
        "",
        "## Responsibility Boundary",
        "Root owns initial routing, live context assembly, and top-level project-development packets. No child nodes exist yet.",
        "",
        "## Allowed Scope",
        allowed_scope,
        "",
        "## Forbidden Scope",
        forbidden_scope,
        "",
        "## Required Checks",
        required_checks_for(task_kind),
        "",
        "## Required Output Contract",
        "- State what changed or what decision was made.",
        "- State what was verified.",
        "- State remaining risks or next steps.",
        "- If blocked, state the exact missing context or permission.",
        "",
    ]
    if broad:
        lines.extend([
            "## Broad Continuation Rule",
            "- Identify a small set of plausible next increments.",
            "- Choose one only if clearly safe and aligned with the project goal.",
            "- Otherwise return an options report.",
            "- Avoid arbitrary broad edits.",
            "",
        ])
    lines.extend([
        "## Assembled Live Context",
        context_text,
        "",
        "## Resume Instructions",
        f"If this packet needs an LLM response, save it to a file and run: .agent/bin/agent resume --run {input_data.get('run_id')} --response <file>",
        "",
    ])
    packet_path.write_text("\n".join(lines), encoding="utf-8")
    return packet_path


def read_context_for_phase(input_data: dict[str, Any], phase: str) -> str:
    context_out = input_data.get("prior_outputs", {}).get("context", {})
    context_path = context_out.get("context_path")
    if context_path and Path(context_path).exists():
        return Path(context_path).read_text(encoding="utf-8")
    return render_context(input_data, assemble_context(Path(input_data["repo_root"]), input_data))


def scope_for(task_kind: str) -> tuple[str, str]:
    if task_kind in {"agent_system_mutation", "agent_system_reflection"}:
        return (
            ".agent/** and AGENTS.md when the task explicitly concerns the agent system.",
            "Product code during bootstrap; .agent/core/** except root-node mutation; node self.py files outside mutation.",
        )
    return (
        "Task-relevant product files and tests when the developer task permits changes.",
        ".agent/core/** unless explicitly performing root mutation; node self.py files outside mutation; secrets and generated output.",
    )


def required_checks_for(task_kind: str) -> str:
    if task_kind in {"agent_system_mutation", "agent_system_reflection"}:
        return "- .agent/bin/agent self-test\n- .agent/bin/agent health"
    if task_kind == "verification":
        return "- Run the requested verification exactly, then report failures without weakening checks."
    return "- Run existing project checks appropriate to the touched scope, or explain why they were not run."


def read_text_if_exists(path: Path, max_chars: int | None = None) -> str:
    if not path.exists() or not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    if max_chars and len(text) > max_chars:
        return text[:max_chars] + "\n[truncated]\n"
    return text


def read_agents(repo_root: Path, max_chars: int) -> str:
    path = repo_root / "AGENTS.md"
    if not path.exists():
        return "AGENTS.md not present."
    text = path.read_text(encoding="utf-8", errors="replace")
    if len(text) > max_chars:
        return f"AGENTS.md exists but is {len(text)} chars; omitted by budget."
    return text


def run_cmd(repo_root: Path, args: list[str]) -> str:
    try:
        result = subprocess.run(args, cwd=repo_root, text=True, capture_output=True, timeout=5, check=False)
    except Exception as exc:
        return f"[command failed: {exc}]"
    text = result.stdout.strip()
    if result.returncode != 0 and result.stderr.strip():
        text += ("\n" if text else "") + result.stderr.strip()
    return text


def cap_lines(text: str, limit: int) -> str:
    lines = text.splitlines()
    if len(lines) <= limit:
        return text
    return "\n".join(lines[:limit] + [f"[truncated after {limit} lines]"])


def repo_tree(repo_root: Path, config: dict[str, Any], limit: int) -> list[str]:
    excluded = set(config.get("excluded_dirs", []))
    entries: list[str] = []
    for root, dirs, files in os.walk(repo_root):
        rel_root = Path(root).relative_to(repo_root)
        rel_posix = rel_root.as_posix()
        depth = 0 if rel_posix == "." else len(rel_root.parts)
        dirs[:] = sorted(d for d in dirs if d not in excluded and f"{rel_posix}/{d}".strip("./") not in excluded)
        if depth >= 3:
            dirs[:] = []
        for name in sorted(files):
            rel = (rel_root / name).as_posix() if rel_posix != "." else name
            if any(rel == item or rel.startswith(item.rstrip("/") + "/") for item in excluded):
                continue
            entries.append(rel)
            if len(entries) >= limit:
                entries.append(f"[truncated after {limit} entries]")
                return entries
    return entries


def detect_manifest_files(repo_root: Path, config: dict[str, Any]) -> list[str]:
    names = {"package.json", "pnpm-workspace.yaml", "tsconfig.json", "Cargo.toml", "pyproject.toml", "go.mod", "Makefile"}
    found = []
    for entry in repo_tree(repo_root, config, 500):
        if Path(entry).name in names:
            found.append(entry)
    return found


def detect_commands(repo_root: Path) -> dict[str, Any]:
    package_json = repo_root / "package.json"
    if not package_json.exists():
        return {}
    try:
        pkg = json.loads(package_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"package.json": "invalid json"}
    scripts = pkg.get("scripts", {})
    interesting = {k: v for k, v in scripts.items() if k in {"check", "test", "lint", "typecheck", "build"} or k.startswith("test:")}
    return {"package.json scripts": interesting}


def task_search(repo_root: Path, task: str, config: dict[str, Any]) -> str:
    words = [w for w in re.findall(r"[A-Za-z0-9_]{4,}", task) if w.lower() not in {"this", "that", "with", "from", "toward"}]
    if not words:
        return "No task keywords selected."
    rg = shutil.which("rg")
    if not rg:
        return "rg not available; keyword search skipped in seed implementation."
    pattern = "|".join(re.escape(word) for word in words[:8])
    args = [rg, "-n", "--max-count", "5", pattern, "."]
    for item in config.get("excluded_dirs", []):
        args.extend(["--glob", f"!{item}/**"])
    result = run_cmd(repo_root, args)
    limit = int(config.get("context_limits", {}).get("grep_matches_total", 120))
    return cap_lines(result, limit)


def last_report(repo_root: Path) -> str:
    runs = repo_root / ".agent" / "runs"
    if not runs.exists():
        return ""
    reports = sorted(runs.glob("*/report.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    return read_text_if_exists(reports[0], 8000) if reports else ""


def stringify(value: Any) -> str:
    if isinstance(value, str):
        return value or "(empty)"
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True)


def enforce_budget(text: str, budget: int) -> str:
    if len(text) <= budget:
        return text
    return text[:budget] + "\n[context truncated by budget]\n"
