from __future__ import annotations

from typing import Any

ALLOWED_STATUSES = {"ok", "needs_llm", "routed", "blocked", "failed"}
OPTIONAL_FIELDS = {
    "run_id",
    "packet_path",
    "context_path",
    "target_node",
    "checks",
    "artifacts",
    "llm_call",
    "blocked_reason",
    "failure_reason",
    "resume_hint",
    "changed_files",
    "verification_summary",
    "next_steps",
}


def validate_phase_output(output: Any, expected_phase: str | None = None) -> dict[str, Any]:
    if not isinstance(output, dict):
        raise ValueError("phase output must be a JSON object")
    for key in ("phase", "node_id", "status", "summary"):
        if key not in output:
            raise ValueError(f"phase output missing required field: {key}")
    if expected_phase is not None and output["phase"] != expected_phase:
        raise ValueError(f"phase output has phase {output['phase']!r}, expected {expected_phase!r}")
    if output["status"] not in ALLOWED_STATUSES:
        raise ValueError(f"invalid phase status: {output['status']!r}")
    if output["phase"] == "route":
        for key in ("target_node", "reason", "fallback"):
            if key not in output:
                raise ValueError(f"route output missing required field: {key}")
    return output


def markdown_for_output(output: dict[str, Any]) -> str:
    lines = [
        f"# Phase: {output.get('phase')}",
        "",
        f"- node: {output.get('node_id')}",
        f"- status: {output.get('status')}",
        f"- summary: {output.get('summary')}",
    ]
    for key in sorted(OPTIONAL_FIELDS):
        if key in output and output[key] not in (None, "", [], {}):
            lines.append(f"- {key}: {output[key]}")
    return "\n".join(lines) + "\n"
