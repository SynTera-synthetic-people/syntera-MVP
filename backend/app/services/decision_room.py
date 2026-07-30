"""Decision Room service — session CRUD, LLM orchestration, streaming.

Prompt strategy: same as report_generation_qual_claude.py — large Python string constant
(DECISION_ROOM_SYSTEM_PROMPT) injected as the Claude system message.
"""

import json
import logging
import re
import time
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models.decision_room import DecisionRoomMessage, DecisionRoomSession
from app.services.decision_room_context import assemble_context
from app.services.decision_room_prompt import DECISION_ROOM_SYSTEM_PROMPT
from app.utils.anthropic_client import get_async_anthropic_client
from app.utils.id_generator import generate_id
from app.services.llm_usage_tracker import record_llm_usage, extract_usage_anthropic_message

logger = logging.getLogger(__name__)

DECISION_ROOM_MODEL = "claude-sonnet-4-5"
TITLE_MODEL = "claude-haiku-4-5-20251001"
MAX_HISTORY_TURNS = 20
MAX_TOKENS = 4096
PROMPT_VERSION = "v1.0"

# Cost per million tokens (USD) — update when Anthropic changes pricing
_MODEL_RATES = {
    "claude-sonnet-4-5": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 0.25, "output": 1.25},
}

GREETING = (
    "You have the research. Now let us figure out what to do with it. "
    "What decision is on the table?"
)


# ── Cost helpers ──────────────────────────────────────────────────────────────

def _compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = _MODEL_RATES.get(model, _MODEL_RATES["claude-sonnet-4-5"])
    return round(
        input_tokens * rates["input"] / 1_000_000
        + output_tokens * rates["output"] / 1_000_000,
        8,
    )


# ── Evidence extraction ───────────────────────────────────────────────────────

_CITATION_RE = re.compile(r"\[SB-(\d+)\]")
_CONFIDENCE_RE = re.compile(r"\[(HIGH CONFIDENCE|MEDIUM CONFIDENCE|DIRECTIONAL)\]")
_GRADE_RE = re.compile(r"\[Grade ([A-D])\]")


def _extract_evidence(text: str) -> List[Dict[str, Any]]:
    evidence: List[Dict[str, Any]] = []
    for m in _CITATION_RE.finditer(text):
        evidence.append({"ref_id": m.group(0), "source_type": "sourcebank", "source_id": m.group(1)})
    for m in _CONFIDENCE_RE.finditer(text):
        evidence.append({"ref_id": m.group(0), "source_type": "report", "grade": m.group(1).replace(" ", "_")})
    for m in _GRADE_RE.finditer(text):
        evidence.append({"ref_id": m.group(0), "source_type": "evidence_grade", "grade": f"GRADE_{m.group(1)}"})
    return evidence


# ── Message history builder ───────────────────────────────────────────────────

def _build_messages_for_claude(
    history: List[Dict[str, Any]],
    user_text: str,
    context_rendered: str,
) -> List[Dict[str, Any]]:
    """Build the messages list for the Anthropic API call.

    history must be a list of plain dicts with keys: role, content, sequence_num.
    First user turn injects the full research context so Claude has it from the start.
    """
    messages: List[Dict[str, Any]] = []

    user_turns = [m for m in history if m["role"] == "user"]

    ordered = sorted(history, key=lambda m: m["sequence_num"])
    for msg in ordered:
        if msg["sequence_num"] == 1:
            continue
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["content"]})

    if len(messages) > MAX_HISTORY_TURNS * 2:
        messages = messages[-(MAX_HISTORY_TURNS * 2):]

    is_first_turn = len(user_turns) == 0
    if is_first_turn and context_rendered:
        content = (
            f"[RESEARCH CONTEXT — READ AND USE AS YOUR EVIDENCE BASE]\n\n"
            f"{context_rendered}\n\n"
            f"[END OF RESEARCH CONTEXT]\n\n"
            f"{user_text}"
        )
    else:
        content = user_text

    messages.append({"role": "user", "content": content})
    return messages


# ── Session management ────────────────────────────────────────────────────────

async def create_session(
    workspace_id: str,
    exploration_id: str,
    flow: str,
    user_id: str,
) -> Dict[str, Any]:
    """Create a new Decision Room session. Assembles and stores context at creation time."""
    ctx = await assemble_context(exploration_id, workspace_id, flow)

    session_id = generate_id()
    now = datetime.utcnow()

    async with AsyncSession(async_engine) as db:
        session = DecisionRoomSession(
            id=session_id,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            flow=flow,
            status="active",
            context_rendered=ctx["rendered"],
            context_metadata=ctx["metadata"],
            prompt_version=PROMPT_VERSION,
            token_total_input=0,
            token_total_output=0,
            cost_usd_total=0.0,
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        db.add(session)
        await db.flush()  # ensures session row is visible within this txn before FK child insert

        # Persist the opening greeting as sequence 1
        greeting_msg = DecisionRoomMessage(
            id=generate_id(),
            session_id=session_id,
            role="analyst",
            content=GREETING,
            sequence_num=1,
            stream_complete=True,
            created_at=now,
        )
        db.add(greeting_msg)
        await db.commit()

    return {
        "session_id": session_id,
        "greeting": GREETING,
        "flow": flow,
        "context_summary": {
            "personas_loaded": ctx.get("personas_loaded", 0),
            "report_source": ctx.get("report_source"),
            "token_estimate": ctx.get("token_estimate", 0),
        },
    }


async def list_sessions(
    workspace_id: str,
    exploration_id: str,
    user_id: str,
    flow: Optional[str] = None,
) -> List[Dict[str, Any]]:
    async with AsyncSession(async_engine) as db:
        stmt = (
            select(DecisionRoomSession)
            .where(
                DecisionRoomSession.workspace_id == workspace_id,
                DecisionRoomSession.exploration_id == exploration_id,
                DecisionRoomSession.created_by == user_id,
                DecisionRoomSession.status != "archived",
            )
            .order_by(DecisionRoomSession.updated_at.desc())
        )
        if flow:
            stmt = stmt.where(DecisionRoomSession.flow == flow)

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        out = []
        for s in sessions:
            # Count messages
            count_result = await db.execute(
                select(func.count())
                .select_from(DecisionRoomMessage)
                .where(DecisionRoomMessage.session_id == s.id)
            )
            msg_count = count_result.scalar_one()
            out.append({
                "id": s.id,
                "title": s.title,
                "flow": s.flow,
                "status": s.status,
                "message_count": msg_count,
                "token_total_input": s.token_total_input,
                "token_total_output": s.token_total_output,
                "cost_usd_total": s.cost_usd_total,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            })
        return out


async def get_session_detail(session_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    async with AsyncSession(async_engine) as db:
        result = await db.execute(
            select(DecisionRoomSession).where(
                DecisionRoomSession.id == session_id,
                DecisionRoomSession.created_by == user_id,
            )
        )
        session = result.scalars().first()
        if not session:
            return None

        msgs_result = await db.execute(
            select(DecisionRoomMessage)
            .where(DecisionRoomMessage.session_id == session_id)
            .order_by(DecisionRoomMessage.sequence_num.asc())
        )
        messages = msgs_result.scalars().all()

    ctx_meta = session.context_metadata or {}
    return {
        "id": session.id,
        "flow": session.flow,
        "title": session.title,
        "status": session.status,
        "prompt_version": session.prompt_version,
        "context_summary": {
            "personas_loaded": (ctx_meta.get("sources", {}).get("personas", {}) or {}).get("count", 0),
            "report_source": ctx_meta.get("report_source"),
            "token_estimate": ctx_meta.get("token_estimate", 0),
        },
        "messages": [_msg_to_dict(m) for m in messages],
        "token_total_input": session.token_total_input,
        "token_total_output": session.token_total_output,
        "cost_usd_total": session.cost_usd_total,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }


async def delete_session(session_id: str, user_id: str) -> bool:
    async with AsyncSession(async_engine) as db:
        result = await db.execute(
            select(DecisionRoomSession).where(
                DecisionRoomSession.id == session_id,
                DecisionRoomSession.created_by == user_id,
            )
        )
        session = result.scalars().first()
        if not session:
            return False
        session.status = "archived"
        session.updated_at = datetime.utcnow()
        await db.commit()
    return True


def _msg_to_dict(m: DecisionRoomMessage) -> Dict[str, Any]:
    return {
        "id": m.id,
        "session_id": m.session_id,
        "role": m.role,
        "content": m.content,
        "sequence_num": m.sequence_num,
        "model_used": m.model_used,
        "token_input": m.token_input,
        "token_output": m.token_output,
        "cost_usd": m.cost_usd,
        "latency_ms": m.latency_ms,
        "evidence": m.evidence,
        "stream_complete": m.stream_complete,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ── Send message (non-streaming) ──────────────────────────────────────────────

async def send_message(
    session_id: str,
    user_id: str,
    user_text: str,
    background_tasks: Optional[BackgroundTasks] = None,
) -> Optional[Dict[str, Any]]:
    async with AsyncSession(async_engine) as db:
        result = await db.execute(
            select(DecisionRoomSession).where(
                DecisionRoomSession.id == session_id,
                DecisionRoomSession.created_by == user_id,
                DecisionRoomSession.status == "active",
            )
        )
        session = result.scalars().first()
        if not session:
            return None

        # Load message history
        msgs_result = await db.execute(
            select(DecisionRoomMessage)
            .where(DecisionRoomMessage.session_id == session_id)
            .order_by(DecisionRoomMessage.sequence_num.asc())
        )
        history_rows = [
            {"role": m.role, "content": m.content, "sequence_num": m.sequence_num}
            for m in msgs_result.scalars().all()
        ]

        # Next sequence number
        next_seq = (max((r["sequence_num"] for r in history_rows), default=0) + 1)

        # Persist user message
        now = datetime.utcnow()
        user_msg = DecisionRoomMessage(
            id=generate_id(),
            session_id=session_id,
            role="user",
            content=user_text,
            sequence_num=next_seq,
            stream_complete=True,
            created_at=now,
        )
        db.add(user_msg)
        await db.flush()

        # Build Claude payload
        messages = _build_messages_for_claude(history_rows, user_text, session.context_rendered)

        client = get_async_anthropic_client()
        started = time.monotonic()

        response = await client.messages.create(
            model=DECISION_ROOM_MODEL,
            max_tokens=MAX_TOKENS,
            system=DECISION_ROOM_SYSTEM_PROMPT,
            messages=messages,
        )

        latency_ms = int((time.monotonic() - started) * 1000)
        analyst_text = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        cost = _compute_cost(DECISION_ROOM_MODEL, input_tokens, output_tokens)
        evidence = _extract_evidence(analyst_text)
        _, _, usage_raw = extract_usage_anthropic_message(response)

        # Persist analyst message
        analyst_msg = DecisionRoomMessage(
            id=generate_id(),
            session_id=session_id,
            role="analyst",
            content=analyst_text,
            sequence_num=next_seq + 1,
            model_used=DECISION_ROOM_MODEL,
            token_input=input_tokens,
            token_output=output_tokens,
            cost_usd=cost,
            latency_ms=latency_ms,
            evidence=evidence or None,
            stream_complete=True,
            created_at=datetime.utcnow(),
        )
        db.add(analyst_msg)

        # Update session totals
        session.token_total_input += input_tokens
        session.token_total_output += output_tokens
        session.cost_usd_total += cost
        session.updated_at = datetime.utcnow()

        # Dual-write into the shared llm_usage_event log (see
        # docs/llm_usage_tracking_plan.md, Section 4) — rides this same
        # transaction, decision_room's own columns above are untouched.
        await record_llm_usage(
            db=db,
            exploration_id=session.exploration_id,
            workspace_id=session.workspace_id,
            stage="decision_room",
            operation="send_message",
            provider="anthropic",
            model=DECISION_ROOM_MODEL,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            usage_raw=usage_raw,
            latency_ms=latency_ms,
            session_id=session_id,
            created_by=user_id,
        )

        await db.commit()

        # Schedule title generation after first real exchange
        is_first_exchange = next_seq == 2  # user is seq 2 (greeting was 1)
        if is_first_exchange and session.title is None and background_tasks:
            ro_desc = (session.context_metadata or {}).get("ro_description", "")
            background_tasks.add_task(
                _generate_and_apply_title,
                session_id=session_id,
                first_user_message=user_text,
                first_analyst_response=analyst_text,
                ro_description=ro_desc,
                exploration_id=session.exploration_id,
                workspace_id=session.workspace_id,
                created_by=user_id,
            )

    return {
        "message_id": analyst_msg.id,
        "session_id": session_id,
        "analyst_response": analyst_text,
        "evidence": evidence,
        "usage": {"input": input_tokens, "output": output_tokens},
        "cost_usd": cost,
        "ts": datetime.utcnow().isoformat(),
    }


# ── Streaming send ────────────────────────────────────────────────────────────

async def _stream_generator(
    session_id: str,
    context_rendered: str,
    context_metadata: Dict[str, Any],
    session_title: Optional[str],
    history: List[Dict[str, Any]],
    user_text: str,
    next_seq: int,
    background_tasks: Optional[BackgroundTasks],
    exploration_id: str,
    workspace_id: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    messages = _build_messages_for_claude(history, user_text, context_rendered)
    client = get_async_anthropic_client()
    started = time.monotonic()
    full_text = ""

    try:
        async with client.messages.stream(
            model=DECISION_ROOM_MODEL,
            max_tokens=MAX_TOKENS,
            system=DECISION_ROOM_SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            async for delta in stream.text_stream:
                full_text += delta
                yield f"data: {json.dumps({'type': 'delta', 'delta': delta})}\n\n"

            final_msg = await stream.get_final_message()
            usage = final_msg.usage
            input_tokens = usage.input_tokens
            output_tokens = usage.output_tokens

        latency_ms = int((time.monotonic() - started) * 1000)
        cost = _compute_cost(DECISION_ROOM_MODEL, input_tokens, output_tokens)
        evidence = _extract_evidence(full_text)
        _, _, usage_raw = extract_usage_anthropic_message(final_msg)

        # Persist analyst message
        analyst_msg_id = generate_id()
        async with AsyncSession(async_engine) as db:
            analyst_msg = DecisionRoomMessage(
                id=analyst_msg_id,
                session_id=session_id,
                role="analyst",
                content=full_text,
                sequence_num=next_seq + 1,
                model_used=DECISION_ROOM_MODEL,
                token_input=input_tokens,
                token_output=output_tokens,
                cost_usd=cost,
                latency_ms=latency_ms,
                evidence=evidence or None,
                stream_complete=True,
                created_at=datetime.utcnow(),
            )
            db.add(analyst_msg)
            await db.execute(
                text(
                    "UPDATE decision_room_session SET "
                    "token_total_input = token_total_input + :in_, "
                    "token_total_output = token_total_output + :out_, "
                    "cost_usd_total = cost_usd_total + :cost, "
                    "updated_at = NOW() "
                    "WHERE id = :sid"
                ),
                {"in_": input_tokens, "out_": output_tokens, "cost": cost, "sid": session_id},
            )

            # Dual-write into the shared llm_usage_event log (see
            # docs/llm_usage_tracking_plan.md, Section 4) — rides this same
            # transaction, decision_room's own columns above are untouched.
            await record_llm_usage(
                db=db,
                exploration_id=exploration_id,
                workspace_id=workspace_id,
                stage="decision_room",
                operation="send_message",
                provider="anthropic",
                model=DECISION_ROOM_MODEL,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                usage_raw=usage_raw,
                latency_ms=latency_ms,
                session_id=session_id,
                created_by=user_id,
            )

            await db.commit()

        # Title generation after first exchange
        is_first_exchange = next_seq == 2
        if is_first_exchange and not session_title and background_tasks:
            ro_desc = (context_metadata or {}).get("ro_description", "")
            background_tasks.add_task(
                _generate_and_apply_title,
                session_id=session_id,
                first_user_message=user_text,
                first_analyst_response=full_text,
                ro_description=ro_desc,
                exploration_id=exploration_id,
                workspace_id=workspace_id,
                created_by=user_id,
            )

        yield f"data: {json.dumps({'type': 'done', 'message_id': analyst_msg_id, 'session_id': session_id, 'usage': {'input': input_tokens, 'output': output_tokens}, 'cost_usd': cost, 'evidence': evidence})}\n\n"

    except Exception as exc:
        logger.exception("Decision Room stream error: %s", exc)
        yield f"data: {json.dumps({'type': 'error', 'code': 'stream_error', 'message': str(exc)})}\n\n"


async def stream_message(
    session_id: str,
    user_id: str,
    user_text: str,
    background_tasks: Optional[BackgroundTasks] = None,
) -> Optional[StreamingResponse]:
    async with AsyncSession(async_engine) as db:
        result = await db.execute(
            select(DecisionRoomSession).where(
                DecisionRoomSession.id == session_id,
                DecisionRoomSession.created_by == user_id,
                DecisionRoomSession.status == "active",
            )
        )
        session = result.scalars().first()
        if not session:
            return None

        # Cache primitive values NOW — after commit the ORM object is expired/detached
        _context_rendered = session.context_rendered or ""
        _context_metadata = session.context_metadata or {}
        _session_title = session.title
        _exploration_id = session.exploration_id
        _workspace_id = session.workspace_id

        msgs_result = await db.execute(
            select(DecisionRoomMessage)
            .where(DecisionRoomMessage.session_id == session_id)
            .order_by(DecisionRoomMessage.sequence_num.asc())
        )
        # Convert to plain dicts NOW — after commit the ORM objects are expired/detached
        history_rows = [
            {"role": m.role, "content": m.content, "sequence_num": m.sequence_num}
            for m in msgs_result.scalars().all()
        ]
        next_seq = max((r["sequence_num"] for r in history_rows), default=0) + 1

        # Persist user message immediately
        user_msg = DecisionRoomMessage(
            id=generate_id(),
            session_id=session_id,
            role="user",
            content=user_text,
            sequence_num=next_seq,
            stream_complete=True,
            created_at=datetime.utcnow(),
        )
        db.add(user_msg)
        await db.commit()

    return StreamingResponse(
        _stream_generator(
            session_id, _context_rendered, _context_metadata, _session_title,
            history_rows, user_text, next_seq, background_tasks,
            _exploration_id, _workspace_id, user_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Title generation ──────────────────────────────────────────────────────────

async def _generate_and_apply_title(
    session_id: str,
    first_user_message: str,
    first_analyst_response: str,
    ro_description: str,
    exploration_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> None:
    """Generate an intelligent session title via Haiku (background task, non-critical)."""
    try:
        client = get_async_anthropic_client()
        prompt = (
            f"Research context: {ro_description[:200]}\n\n"
            f"User's first question: {first_user_message[:300]}\n\n"
            f"Advisor's first response (excerpt): {first_analyst_response[:300]}\n\n"
            "Generate a concise 4-7 word title for this strategic advisory conversation. "
            "The title should describe the strategic topic being discussed. "
            "Return the title only — no quotes, no punctuation at end, no explanation."
        )
        result = await client.messages.create(
            model=TITLE_MODEL,
            max_tokens=32,
            messages=[{"role": "user", "content": prompt}],
        )
        input_tokens, output_tokens, usage_raw = extract_usage_anthropic_message(result)
        await record_llm_usage(
            db=None,
            exploration_id=exploration_id,
            workspace_id=workspace_id,
            stage="decision_room",
            operation="title_generation",
            provider="anthropic",
            model=TITLE_MODEL,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            usage_raw=usage_raw,
            session_id=session_id,
            created_by=created_by,
        )
        title = result.content[0].text.strip()[:120]
        if title:
            async with AsyncSession(async_engine) as db:
                await db.execute(
                    text("UPDATE decision_room_session SET title = :title WHERE id = :id"),
                    {"title": title, "id": session_id},
                )
                await db.commit()
    except Exception as exc:
        logger.warning("Title generation failed for session %s: %s", session_id, exc)
