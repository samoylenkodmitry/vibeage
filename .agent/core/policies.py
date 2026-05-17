from __future__ import annotations

import re
from pathlib import Path

WORK_PHASES = ["receive", "classify", "route", "context", "plan", "execute", "verify", "report"]
GROWTH_PHASES = ["reflect", "mutate", "compact"]
PHASES = WORK_PHASES + GROWTH_PHASES
ROOT_OWNED_PATHS = [".agent/core", ".agent/system", ".agent/bin/agent"]
NODE_ID_PATTERN = r"^[A-Za-z0-9_-]+$"

_NODE_ID_RE = re.compile(NODE_ID_PATTERN)
_NODE_PROTECTED_FILES = {"self.py", "manifest.md", "children.md", "memory.md", "metrics.md"}


def is_work_phase(phase: str) -> bool:
    return phase in WORK_PHASES


def is_growth_phase(phase: str) -> bool:
    return phase in GROWTH_PHASES


def normalize_node_id(node_id: str) -> str:
    if not isinstance(node_id, str) or not node_id:
        raise ValueError("node id must be a non-empty string")
    if node_id in {".", ".."}:
        raise ValueError("node id may not be . or ..")
    if "/" in node_id or "\\" in node_id:
        raise ValueError("node id may not contain path separators")
    if Path(node_id).is_absolute():
        raise ValueError("node id may not be an absolute path")
    if not _NODE_ID_RE.fullmatch(node_id):
        raise ValueError(f"node id does not match {NODE_ID_PATTERN}")
    return node_id


def node_dir(repo_root: Path, node_id: str) -> Path:
    return repo_root / ".agent" / "nodes" / normalize_node_id(node_id)


def _relative_posix(path: Path, repo_root: Path) -> str | None:
    try:
        return path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return None


def is_protected_agent_path(path: Path, repo_root: Path) -> bool:
    rel = _relative_posix(path, repo_root)
    if rel is None:
        return False
    if rel == ".agent/bin/agent":
        return True
    if rel.startswith(".agent/core/") or rel.startswith(".agent/system/"):
        return True
    parts = rel.split("/")
    if len(parts) == 4 and parts[0] == ".agent" and parts[1] == "nodes" and parts[3] in _NODE_PROTECTED_FILES:
        return True
    return False
