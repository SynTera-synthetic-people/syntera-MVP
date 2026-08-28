"""Orchestration and the runtime flag. Contract: nothing here raises into a
call site — failures are recorded as neuro_event rows with error set and the
caller proceeds unchanged. Interview runs chain turns in guide order and
start fresh (re-runs reproduce identical states); rebuttal and live replies
continue from the stored state.
"""
from __future__ import annotations

import json
import logging
import time
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.config import settings
from app.db import async_engine
from app.models.neuro import NeuroFlag
from app.neuro import engine, persona_params, question_features, state_store
from app.neuro.conversation_key import (
    conversation_key,
    interview_conversation_key,
    rebuttal_conversation_key,
)
from app.neuro.types import AffectiveState, Surface

logger = logging.getLogger(__name__)

FLAG_KEY = "NEURO_MODE"
_FLAG_CACHE_TTL_SECONDS = 15.0
_flag_cache: dict[str, tuple[bool, float]] = {}


async def is_enabled() -> bool:
    now = time.monotonic()
    cached = _flag_cache.get(FLAG_KEY)
    if cached and (now - cached[1]) < _FLAG_CACHE_TTL_SECONDS:
        return cached[0]
    enabled = bool(settings.NEURO_MODE_DEFAULT)
    try:
        async with AsyncSession(async_engine) as session:
            row = (
                await session.execute(select(NeuroFlag).where(NeuroFlag.key == FLAG_KEY))
            ).scalars().first()
            if row is not None:
                enabled = str(row.value).strip().lower() in ("1", "true", "on", "yes")
    except Exception:
        # The flag lookup itself must not take down a request path.
        logger.exception("NEURO_MODE flag lookup failed; using default=%s", enabled)
    _flag_cache[FLAG_KEY] = (enabled, now)
    return enabled


async def set_enabled(enabled: bool) -> None:
    from datetime import datetime

    async with AsyncSession(async_engine) as session:
        async with session.begin():
            row = (
                await session.execute(select(NeuroFlag).where(NeuroFlag.key == FLAG_KEY))
            ).scalars().first()
            if row is None:
                session.add(NeuroFlag(key=FLAG_KEY, value="true" if enabled else "false"))
            else:
                row.value = "true" if enabled else "false"
                row.updated_at = datetime.utcnow()
                session.add(row)
    _flag_cache.pop(FLAG_KEY, None)


async def cache_interview_question_features(question_id: str, text: str) -> None:
    """Compute and cache affect features for a newly created interview
    question. Best-effort: failures are logged, never raised."""
    try:
        await question_features.get_or_compute(question_id, "interview", text)
    except Exception:
        logger.exception(
            "Question feature caching failed [question_id=%s]", question_id
        )


async def record_shadow_turn(
    *,
    conversation_key: str,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    question_text: str,
    question_id: Optional[str],
    surface: Surface,
    turn_index: Optional[int] = None,
    persona: Optional[dict] = None,
    previous_state: Optional[AffectiveState] = None,
    continue_from_stored: bool = False,
) -> Optional[AffectiveState]:
    """Compute and persist one shadow turn. Returns the state, or None on any
    failure; a None return is invisible to the caller's own flow.

    With continue_from_stored, the stored conversation state is loaded under
    the row lock and used as the previous state, and turn_index defaults to
    one past it. Otherwise previous_state (which may be None for a fresh
    start) is used as given.
    """
    try:
        params = persona_params.from_persona(persona)
        q = question_features.tag_question(question_text, question_id=question_id)

        def _compute(stored: Optional[AffectiveState]) -> AffectiveState:
            previous = stored if continue_from_stored else previous_state
            if turn_index is not None:
                idx = turn_index
            elif previous is not None:
                idx = previous.turn_index + 1
            else:
                idx = 0
            return engine.compute_turn(
                persona=params, question=q, previous=previous, turn_index=idx
            )

        return await state_store.transact_turn(
            conversation_key=conversation_key,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=persona_id,
            question_id=question_id,
            question_text_hash=q.text_hash,
            surface=surface.value,
            compute=_compute,
            shadow=True,
        )
    except Exception as exc:
        logger.exception(
            "Neuro turn failed open [conversation_key=%s surface=%s]",
            conversation_key, surface.value,
        )
        await state_store.record_failure(
            conversation_key=conversation_key,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=persona_id,
            question_id=question_id,
            surface=surface.value,
            turn_index=turn_index or 0,
            error=f"{type(exc).__name__}: {exc}",
            neuro_version=engine.ENGINE_VERSION,
        )
        return None


async def record_interview_shadow_turns(
    *,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    question_texts: List[str],
    persona: Optional[dict] = None,
) -> int:
    """Record one shadow turn per interview question, chained in guide order:
    each turn carries the state produced by the previous one, and the run
    starts fresh so a re-run reproduces identical states. Returns the number
    recorded. Never raises; a no-op when the flag is off. The flag check
    lives here so call sites stay a single line."""
    try:
        if not await is_enabled():
            return 0
        key = interview_conversation_key(workspace_id, exploration_id, persona_id)
        recorded = 0
        previous: Optional[AffectiveState] = None
        for idx, text in enumerate(question_texts):
            state = await record_shadow_turn(
                conversation_key=key,
                workspace_id=workspace_id,
                exploration_id=exploration_id,
                persona_id=persona_id,
                question_text=text,
                question_id=None,
                surface=Surface.INTERVIEW,
                turn_index=idx,
                persona=persona,
                previous_state=previous,
            )
            if state is not None:
                recorded += 1
                previous = state
        logger.info(
            "Neuro shadow recorded %d/%d interview turns "
            "[exploration_id=%s persona_id=%s]",
            recorded, len(question_texts), exploration_id, persona_id,
        )
        return recorded
    except Exception:
        logger.exception(
            "Neuro interview adapter failed open [exploration_id=%s persona_id=%s]",
            exploration_id, persona_id,
        )
        return 0


def _single_persona_id(persona_id) -> Optional[str]:
    """A rebuttal session's persona_id may be one id or a JSON-encoded list.
    Emotional state is tracked per persona, so only single-persona sessions
    resolve; group sessions return None and are skipped."""
    if isinstance(persona_id, list):
        return persona_id[0] if len(persona_id) == 1 else None
    if isinstance(persona_id, str):
        raw = persona_id.strip()
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
            except (ValueError, TypeError):
                return None
            return parsed[0] if isinstance(parsed, list) and len(parsed) == 1 else None
        return raw or None
    return None


async def record_rebuttal_shadow_turn(
    *,
    workspace_id: str,
    exploration_id: Optional[str],
    persona_id,
    question_text: str,
    persona: Optional[dict] = None,
) -> Optional[AffectiveState]:
    """Record one shadow turn for a rebuttal exchange, continuing from the
    conversation's stored state so emotion carried out of the interview
    persists into the challenge. Never raises; a no-op when the flag is off,
    when the session has no exploration, or for group sessions."""
    try:
        if not await is_enabled():
            return None
        single = _single_persona_id(persona_id)
        if not workspace_id or not exploration_id or single is None:
            return None
        key = rebuttal_conversation_key(workspace_id, exploration_id, single)
        return await record_shadow_turn(
            conversation_key=key,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=single,
            question_text=question_text,
            question_id=None,
            surface=Surface.REBUTTAL,
            turn_index=None,
            persona=persona,
            continue_from_stored=True,
        )
    except Exception:
        logger.exception(
            "Neuro rebuttal adapter failed open [exploration_id=%s]", exploration_id
        )
        return None


async def record_artifact_shadow_turns(
    *,
    workspace_id: Optional[str],
    exploration_id: Optional[str],
    persona_id: Optional[str],
    question_texts: List[str],
    persona: Optional[dict] = None,
    session_id: Optional[str] = None,
) -> int:
    """Shadow turns for an artifact-response run, chained in guide order on a
    dedicated thread so artifact state never overwrites the persona's
    interview thread. Never raises; no-op when the flag is off or ids are
    missing."""
    try:
        if not await is_enabled():
            return 0
        if not workspace_id or not exploration_id:
            return 0
        key = conversation_key(
            workspace_id, exploration_id, persona_id,
            thread=f"artifact:{session_id}" if session_id else "artifact",
        )
        recorded = 0
        previous: Optional[AffectiveState] = None
        for idx, text in enumerate(question_texts):
            state = await record_shadow_turn(
                conversation_key=key,
                workspace_id=workspace_id,
                exploration_id=exploration_id,
                persona_id=persona_id,
                question_text=text,
                question_id=None,
                surface=Surface.ARTIFACT_RESPONSE,
                turn_index=idx,
                persona=persona,
                previous_state=previous,
            )
            if state is not None:
                recorded += 1
                previous = state
        return recorded
    except Exception:
        logger.exception(
            "Neuro artifact adapter failed open [exploration_id=%s]", exploration_id
        )
        return 0


async def record_live_reply_shadow_turn(
    *,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    question_text: str,
    persona: Optional[dict] = None,
) -> Optional[AffectiveState]:
    """Shadow turn for a live conversation reply. Continues the persona's
    stored interview thread, so emotion carried out of the guide run persists
    into the live exchange. Never raises; no-op when the flag is off."""
    try:
        if not await is_enabled():
            return None
        if not workspace_id or not exploration_id or not persona_id:
            return None
        key = interview_conversation_key(workspace_id, exploration_id, persona_id)
        return await record_shadow_turn(
            conversation_key=key,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=persona_id,
            question_text=question_text,
            question_id=None,
            surface=Surface.INTERVIEW,
            turn_index=None,
            persona=persona,
            continue_from_stored=True,
        )
    except Exception:
        logger.exception(
            "Neuro live-reply adapter failed open [exploration_id=%s]", exploration_id
        )
        return None

async def record_survey_shadow_turns(
    *,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    question_texts: List[str],
    simulation_id: Optional[str] = None,
    persona: Optional[dict] = None,
) -> int:
    """Shadow turns for a survey simulation run, on a dedicated thread per
    simulation. Persona parameters are fetched here so the call site stays a
    single line; a fetch failure degrades to population defaults. Never
    raises; no-op when the flag is off."""
    try:
        if not await is_enabled():
            return 0
        if not workspace_id or not exploration_id:
            return 0
        if persona is None and persona_id:
            try:
                from app.services.persona import get_persona

                persona = await get_persona(persona_id)
            except Exception:
                persona = None
        key = conversation_key(
            workspace_id, exploration_id, persona_id,
            thread=f"survey:{simulation_id}" if simulation_id else "survey",
        )
        recorded = 0
        previous: Optional[AffectiveState] = None
        for idx, text in enumerate(question_texts):
            state = await record_shadow_turn(
                conversation_key=key,
                workspace_id=workspace_id,
                exploration_id=exploration_id,
                persona_id=persona_id,
                question_text=text,
                question_id=None,
                surface=Surface.SURVEY_SIMULATION,
                turn_index=idx,
                persona=persona,
                previous_state=previous,
            )
            if state is not None:
                recorded += 1
                previous = state
        return recorded
    except Exception:
        logger.exception(
            "Neuro survey adapter failed open [exploration_id=%s]", exploration_id
        )
        return 0
