"""Row-locked persistence for conversation affective state.

One transaction per turn: SELECT ... FOR UPDATE on the single
neuro_conversation_state row serialises concurrent turns of the same
conversation while different conversations touch different rows and never
contend. SET LOCAL lock_timeout bounds the wait so a stuck lock holder
surfaces as an error the caller can degrade from, instead of hanging a
request. The stored previous state is read, the new state computed, and the
state upsert plus the append-only neuro_event row are all written inside
that same transaction, so a turn can neither observe a half-written
predecessor nor leave an event without its state.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Callable, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import async_engine
from app.models.neuro import NeuroConversationState, NeuroEvent
from app.neuro.types import AffectiveState

logger = logging.getLogger(__name__)

# Well above a healthy turn (no LLM call happens under the lock), well below
# a user noticing a stall.
LOCK_TIMEOUT_MS = 3000


async def load_state_for_update(
    session: AsyncSession, conversation_key: str
) -> Optional[NeuroConversationState]:
    """Lock and return the conversation's state row, or None if absent.
    Must be called inside an open transaction; the lock releases on
    commit/rollback."""
    await session.execute(text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT_MS}ms'"))
    result = await session.execute(
        select(NeuroConversationState)
        .where(NeuroConversationState.conversation_key == conversation_key)
        .with_for_update()
    )
    return result.scalars().first()


def _parse_previous(row: Optional[NeuroConversationState]) -> Optional[AffectiveState]:
    """Previous state from a stored row. Rows written under an older schema
    that no longer validate read as no-previous rather than failing the turn."""
    if row is None or not row.state_json:
        return None
    try:
        return AffectiveState.from_state_json(row.state_json)
    except Exception:
        logger.warning(
            "Stored neuro state is unreadable; treating as fresh "
            "[conversation_key=%s]", row.conversation_key
        )
        return None


async def transact_turn(
    *,
    conversation_key: str,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    question_id: Optional[str],
    question_text_hash: Optional[str],
    surface: str,
    compute: Callable[[Optional[AffectiveState]], AffectiveState],
    shadow: bool = True,
) -> AffectiveState:
    """Run one turn under the conversation row lock: load the stored previous
    state, call compute(previous), upsert the state row and append the event
    row atomically. Returns the computed state."""
    async with AsyncSession(async_engine) as session:
        async with session.begin():
            row = await load_state_for_update(session, conversation_key)
            state = compute(_parse_previous(row))
            state_json = state.to_state_json()
            if row is None:
                row = NeuroConversationState(
                    conversation_key=conversation_key,
                    workspace_id=workspace_id,
                    exploration_id=exploration_id,
                    persona_id=persona_id,
                    turn_index=state.turn_index,
                    state_json=state_json,
                    updated_at=datetime.utcnow(),
                )
            else:
                row.turn_index = state.turn_index
                row.state_json = state_json
                row.updated_at = datetime.utcnow()
            session.add(row)
            session.add(
                NeuroEvent(
                    conversation_key=conversation_key,
                    workspace_id=workspace_id,
                    exploration_id=exploration_id,
                    persona_id=persona_id,
                    question_id=question_id,
                    question_text_hash=question_text_hash,
                    turn_index=state.turn_index,
                    surface=surface,
                    shadow=shadow,
                    state_json=state_json,
                    error=None,
                    neuro_version=state.provenance.model_version,
                )
            )
        return state


async def record_failure(
    *,
    conversation_key: str,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    question_id: Optional[str],
    surface: str,
    turn_index: int,
    error: str,
    neuro_version: str,
) -> None:
    """Record a layer failure as an event row with empty state. Best-effort:
    if this write also fails, log and return — the caller has already decided
    the turn continues."""
    try:
        async with AsyncSession(async_engine) as session:
            async with session.begin():
                session.add(
                    NeuroEvent(
                        conversation_key=conversation_key,
                        workspace_id=workspace_id,
                        exploration_id=exploration_id,
                        persona_id=persona_id,
                        question_id=question_id,
                        turn_index=turn_index,
                        surface=surface,
                        shadow=True,
                        state_json={},
                        error=error[:2000],
                        neuro_version=neuro_version,
                    )
                )
    except Exception:
        logger.exception(
            "Could not record neuro failure [conversation_key=%s]", conversation_key
        )


async def read_state(conversation_key: str) -> Optional[NeuroConversationState]:
    """Lock-free read for the API and debugging."""
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(NeuroConversationState).where(
                NeuroConversationState.conversation_key == conversation_key
            )
        )
        return result.scalars().first()


async def read_events_for_exploration(
    workspace_id: str, exploration_id: str, limit: int = 5000
) -> list[NeuroEvent]:
    """All recorded events for one exploration, newest first, bounded."""
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(NeuroEvent)
            .where(
                NeuroEvent.workspace_id == workspace_id,
                NeuroEvent.exploration_id == exploration_id,
            )
            .order_by(NeuroEvent.created_at.desc())
            .limit(max(1, min(limit, 20000)))
        )
        return list(result.scalars().all())


async def read_events(conversation_key: str, limit: int = 100) -> list[NeuroEvent]:
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(NeuroEvent)
            .where(NeuroEvent.conversation_key == conversation_key)
            .order_by(NeuroEvent.created_at.desc())
            .limit(max(1, min(limit, 500)))
        )
        return list(result.scalars().all())
