"""Conversation identity for affective state.

Interview and RebuttalSession rows share no identifier (interviews group by
session_group_id, rebuttals by simulation_id), but emotional state must carry
from an interview into the rebuttal that challenges it. Both therefore derive
the same key from what they do share:

    conv1:<workspace_id>:<exploration_id>:<persona_id>

One emotional thread per persona per exploration. This is unambiguous today
because start_interview() replaces any prior guide-driven interview for the
same triple, so exactly one live guide interview exists per key. Rebuttals in
the same exploration resolve to the same triple and hence the same state.

The "conv1" prefix versions the convention: if a stored conversation id ever
replaces derivation, old keys stay distinguishable. Population-level runs
(persona_id is None) use a literal "population" segment so survey-simulation
call sites can reuse the same function.
"""
from __future__ import annotations

from typing import Optional

_PREFIX = "conv1"
_POPULATION = "population"


def conversation_key(
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
) -> str:
    if not workspace_id or not exploration_id:
        raise ValueError("workspace_id and exploration_id are required")
    return f"{_PREFIX}:{workspace_id}:{exploration_id}:{persona_id or _POPULATION}"


def interview_conversation_key(
    workspace_id: str, exploration_id: str, persona_id: Optional[str]
) -> str:
    return conversation_key(workspace_id, exploration_id, persona_id)


def rebuttal_conversation_key(
    workspace_id: str, exploration_id: str, persona_id: Optional[str]
) -> str:
    return conversation_key(workspace_id, exploration_id, persona_id)
