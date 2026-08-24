"""Neuroscience layer endpoints: read-only state, trajectory and
effective-count visibility for the frontend and debugging, plus the runtime
on/off switch. Shadow-only: enabling the layer only starts recording; no
response content changes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.user import User
from app.neuro import effective_n, engine, service, state_store
from app.neuro.conversation_key import conversation_key
from app.routers.auth_dependencies import get_current_active_user

router = APIRouter(prefix="/neuro", tags=["Neuroscience Layer"])


class NeuroModeIn(BaseModel):
    enabled: bool


@router.get("/status")
async def neuro_status(current_user: User = Depends(get_current_active_user)):
    return {
        "status": "success",
        "data": {
            "enabled": await service.is_enabled(),
            "engine_version": engine.ENGINE_VERSION,
            "mode": "shadow",
        },
    }


@router.post("/mode")
async def neuro_set_mode(
    payload: NeuroModeIn,
    current_user: User = Depends(get_current_active_user),
):
    await service.set_enabled(payload.enabled)
    return {"status": "success", "data": {"enabled": await service.is_enabled()}}


@router.get(
    "/workspaces/{workspace_id}/explorations/{exploration_id}/personas/{persona_id}/state"
)
async def get_conversation_state(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
):
    key = conversation_key(workspace_id, exploration_id, persona_id)
    row = await state_store.read_state(key)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No neuro state recorded for this conversation yet",
        )
    return {
        "status": "success",
        "data": {
            "conversation_key": row.conversation_key,
            "turn_index": row.turn_index,
            "state": row.state_json,
            "updated_at": row.updated_at.isoformat(),
        },
    }


@router.get(
    "/workspaces/{workspace_id}/explorations/{exploration_id}/personas/{persona_id}/events"
)
async def get_conversation_events(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_active_user),
):
    key = conversation_key(workspace_id, exploration_id, persona_id)
    events = await state_store.read_events(key, limit=limit)
    return {
        "status": "success",
        "data": [
            {
                "id": e.id,
                "turn_index": e.turn_index,
                "surface": e.surface,
                "shadow": e.shadow,
                "error": e.error,
                "neuro_version": e.neuro_version,
                "state": e.state_json,
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ],
    }


@router.get(
    "/workspaces/{workspace_id}/explorations/{exploration_id}/effective-n"
)
async def get_effective_n(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Per-question effective respondent counts over recorded shadow events:
    for each question, how many personas answered versus abstained on their
    latest computation."""
    events = await state_store.read_events_for_exploration(
        workspace_id, exploration_id
    )
    return {"status": "success", "data": effective_n.aggregate(events)}
