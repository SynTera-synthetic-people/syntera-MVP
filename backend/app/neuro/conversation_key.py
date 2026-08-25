"""Conversation identity. Interview and rebuttal rows share no identifier, so
both derive the same key from (workspace, exploration, persona); the prefix
versions the convention. See conversation_key() for thread qualifiers.
"""
from __future__ import annotations

from typing import Optional

_PREFIX = "conv1"
_POPULATION = "population"


def conversation_key(
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    thread: Optional[str] = None,
) -> str:
    """One key per emotional thread. Interview and rebuttal share the default
    thread; surfaces that must not overwrite it (artifact runs, surveys) pass
    a thread qualifier and get their own state row."""
    if not workspace_id or not exploration_id:
        raise ValueError("workspace_id and exploration_id are required")
    base = f"{_PREFIX}:{workspace_id}:{exploration_id}:{persona_id or _POPULATION}"
    return f"{base}:{thread}" if thread else base


def interview_conversation_key(
    workspace_id: str, exploration_id: str, persona_id: Optional[str]
) -> str:
    return conversation_key(workspace_id, exploration_id, persona_id)


def rebuttal_conversation_key(
    workspace_id: str, exploration_id: str, persona_id: Optional[str]
) -> str:
    return conversation_key(workspace_id, exploration_id, persona_id)
