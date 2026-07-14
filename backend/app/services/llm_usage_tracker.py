"""Shared LLM token/cost usage tracking.

Generalizes the per-message tracking pattern in app/services/decision_room.py
into a single append-only log (app.models.llm_usage.LLMUsageEvent) keyed by
exploration_id, so cost per exploration can be queried across every
instrumented call site. See docs/llm_usage_tracking_plan.md for the full
design and rollout phasing.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models.llm_usage import LLMUsageEvent

logger = logging.getLogger(__name__)

# Rates in USD per 1M tokens (input, output).
# Verified against official provider pricing pages: 2026-07-10.
# Standard (non-cached, non-batch) rates. Cached input bills lower;
# gpt-5 reasoning tokens bill at the output rate — see usage_raw
# for per-call cache/reasoning breakdowns.
RATES_LAST_VERIFIED = "2026-07-10"

_MODEL_RATES: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-5":        (1.25, 10.00),
    "gpt-4.1":      (2.00,  8.00),
    "gpt-4o":       (2.50, 10.00),
    "gpt-4o-mini":  (0.15,  0.60),
    # Anthropic
    "claude-sonnet-4-6":          (3.00, 15.00),
    "claude-sonnet-4-5":          (3.00, 15.00),
    "claude-haiku-4-5-20251001":  (1.00,  5.00),
    # Gemini (verified against ai.google.dev/gemini-api/docs/pricing: 2026-07-13)
    "gemini-2.5-flash": (0.30, 2.50),
}

logger.info("LLM usage rate table last verified: %s", RATES_LAST_VERIFIED)

_warned_unknown_models: set[str] = set()


def _compute_cost(model: str, input_tokens: int, output_tokens: int) -> Optional[float]:
    """Returns None (never a guessed fallback rate) for a model not in the table."""
    rates = _MODEL_RATES.get(model)
    if rates is None:
        if model not in _warned_unknown_models:
            _warned_unknown_models.add(model)
            logger.warning("No pricing rate for model %r — cost_usd will be recorded as None", model)
        return None
    input_rate, output_rate = rates
    return round(input_tokens * input_rate / 1_000_000 + output_tokens * output_rate / 1_000_000, 8)


def _model_dump(usage_obj: Any) -> Optional[dict]:
    if usage_obj is None:
        return None
    try:
        return usage_obj.model_dump(mode="json")
    except Exception:
        logger.debug("Could not model_dump() usage object of type %s", type(usage_obj), exc_info=True)
        return None


def extract_usage_openai_chat(response: Any) -> tuple[int, int, Optional[dict]]:
    """OpenAI Chat Completions API: response.usage.prompt_tokens/.completion_tokens."""
    try:
        usage = response.usage
        if usage is None:
            return (0, 0, None)
        return (usage.prompt_tokens, usage.completion_tokens, _model_dump(usage))
    except Exception:
        logger.debug("Malformed/missing usage on OpenAI chat completion response", exc_info=True)
        return (0, 0, None)


def extract_usage_openai_responses(response: Any) -> tuple[int, int, Optional[dict]]:
    """OpenAI Responses API: response.usage.input_tokens/.output_tokens."""
    try:
        usage = response.usage
        if usage is None:
            return (0, 0, None)
        return (usage.input_tokens, usage.output_tokens, _model_dump(usage))
    except Exception:
        logger.debug("Malformed/missing usage on OpenAI responses API response", exc_info=True)
        return (0, 0, None)


def extract_usage_anthropic_message(response_or_final_message: Any) -> tuple[int, int, Optional[dict]]:
    """Anthropic Messages API: .usage.input_tokens/.output_tokens.

    Same shape for a non-streaming `messages.create(...)` response and a
    streaming `await stream.get_final_message()` result.
    """
    try:
        usage = response_or_final_message.usage
        if usage is None:
            return (0, 0, None)
        return (usage.input_tokens, usage.output_tokens, _model_dump(usage))
    except Exception:
        logger.debug("Malformed/missing usage on Anthropic message response", exc_info=True)
        return (0, 0, None)


def extract_usage_gemini(response: Any) -> tuple[int, int, Optional[dict]]:
    """Gemini (google-genai) generate_content response:
    .usage_metadata.prompt_token_count/.candidates_token_count.

    usage_metadata (or its individual token-count fields) can be None on
    blocked/empty responses (e.g. a safety filter trip) — treated as zero
    tokens rather than raised, with a warning logged since this is a
    Gemini-specific failure mode the other providers don't hit.
    """
    try:
        usage = response.usage_metadata
        if usage is None:
            logger.warning("Gemini response has no usage_metadata (blocked/empty response?) — recording zero tokens")
            return (0, 0, None)
        return (usage.prompt_token_count or 0, usage.candidates_token_count or 0, _model_dump(usage))
    except Exception:
        logger.debug("Malformed/missing usage on Gemini generate_content response", exc_info=True)
        return (0, 0, None)


async def record_llm_usage(
    *,
    exploration_id: str,
    stage: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    usage_raw: Optional[dict] = None,
    operation: Optional[str] = None,
    latency_ms: Optional[int] = None,
    status: str = "success",
    error_message: Optional[str] = None,
    workspace_id: Optional[str] = None,
    persona_id: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    created_by: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """Records one LLM usage event. Best-effort — never raises.

    Tracking must never break the underlying LLM feature. If `db` is
    provided, the row is added to that session without committing (it rides
    the caller's existing transaction); if `db` is None, a short-lived
    session is opened and committed here.

    `status="error"` should only ever be passed from an *existing* except
    block at the call site — this function does not itself decide whether a
    call failed, and callers must not add new exception handling solely to
    produce an error row (see docs/llm_usage_tracking_plan.md, amendment 2).
    """
    try:
        cost_usd = _compute_cost(model, input_tokens, output_tokens)
        event = LLMUsageEvent(
            exploration_id=exploration_id,
            workspace_id=workspace_id,
            stage=stage,
            operation=operation,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            usage_raw=usage_raw,
            status=status,
            error_message=error_message,
            persona_id=persona_id,
            session_id=session_id,
            request_id=request_id,
            created_by=created_by,
        )
        if db is not None:
            db.add(event)
        else:
            async with AsyncSession(async_engine) as owned_db:
                owned_db.add(event)
                await owned_db.commit()
    except Exception:
        logger.exception(
            "record_llm_usage failed (exploration_id=%s, stage=%s, provider=%s, model=%s) — swallowing",
            exploration_id, stage, provider, model,
        )


class UsageCollector:
    """Thread-safe in-memory buffer for LLM usage events recorded from worker
    threads (e.g. digital_brain_pipeline.py's internal ThreadPoolExecutor
    fan-out), where opening an AsyncSession directly is not safe.

    Ownership: the caller that will eventually flush the events (e.g. the
    router handling the request) creates this and passes it *into* the
    synchronous/threaded work — it is never created internally by that work,
    so events recorded before a mid-run failure are not lost (see
    docs/llm_usage_tracking_plan.md, amendment 3).
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._records: list[dict] = []

    def record(self, **kwargs: Any) -> None:
        with self._lock:
            self._records.append(kwargs)

    def drain(self) -> list[dict]:
        with self._lock:
            records, self._records = self._records, []
            return records


async def flush_usage_events(
    events: list[dict],
    *,
    exploration_id: str,
    workspace_id: Optional[str] = None,
    created_by: Optional[str] = None,
    request_id: Optional[str] = None,
) -> None:
    """Persists a batch of collected usage events in one session/commit.

    Best-effort — never raises. Typically called from a `finally` block
    around a pipeline invocation, so it must never mask the original
    exception that may be propagating through that `finally`.
    """
    if not events:
        return
    try:
        async with AsyncSession(async_engine) as db:
            for record in events:
                record.setdefault("exploration_id", exploration_id)
                record.setdefault("workspace_id", workspace_id)
                record.setdefault("created_by", created_by)
                record.setdefault("request_id", request_id)
                try:
                    await record_llm_usage(db=db, **record)
                except Exception:
                    # record_llm_usage already swallows its own errors; this
                    # guards against a malformed record dict (e.g. a missing
                    # required key) failing at the call boundary and
                    # dropping the rest of the batch.
                    logger.exception("Skipping malformed usage record in flush_usage_events: %r", record)
            await db.commit()
    except Exception:
        logger.exception(
            "flush_usage_events failed (exploration_id=%s, request_id=%s, event_count=%s) — swallowing",
            exploration_id, request_id, len(events),
        )
