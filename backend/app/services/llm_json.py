"""
Shared helper for OpenAI Chat Completions calls that must return a JSON object.

Why this exists
---------------
`response_format={"type": "json_object"}` guarantees the model emits *syntactically
valid* JSON only when it is allowed to finish. When a completion stops because it
hit the output-token ceiling, the API still returns **HTTP 200** with
`finish_reason="length"` and a payload that is a *prefix* of a JSON document —
i.e. unparseable. A bare `json.loads()` on that payload raises deep inside a
request handler and surfaces to the client as a raw 500.

The same call sites can also receive `message.content is None` (refused or
content-filtered completions), which makes `json.loads` raise `TypeError`
instead.

This module centralises the three checks every JSON-mode call needs:

  1. content is present,
  2. the completion finished naturally (`finish_reason == "stop"`),
  3. the payload parses,

and emits a structured log line plus an `llm_usage_event` row either way, so a
failure is diagnosable from data rather than from a stack trace.

Retry policy
------------
Deliberately narrow, because the layers below already retry:

  * transient network errors, 429s and 5xxs are retried by the OpenAI SDK
    itself (`AsyncOpenAI(max_retries=2)` by default) — re-adding that here
    would duplicate existing infrastructure;
  * empty content and unparseable-but-complete payloads ARE retried here,
    because they are non-deterministic model behaviour;
  * truncation is NOT retried here. Re-issuing an identical request that
    overflowed the output window will deterministically overflow again. The
    caller owns that recovery, because only the caller can shrink the request
    (see `_generate_answer_batch` in services/interview.py, which splits the
    batch in half and retries the halves).
"""

import json
import logging
import time
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI, BadRequestError

from app.services.llm_usage_tracker import extract_usage_openai_chat, record_llm_usage

logger = logging.getLogger(__name__)


# Longest completion `gpt-4o` / `gpt-4o-mini` will produce. Passing this
# explicitly (rather than omitting `max_tokens` and inheriting it implicitly)
# keeps the output budget visible at the call site and matches the existing
# questionnaire flow, which already sets it — see services/questionnaire.py.
OPENAI_MAX_OUTPUT_TOKENS = 16_384

# How much of the offending payload to keep in logs / usage rows. Enough to
# recognise where generation stopped, small enough not to bloat the log or the
# JSONB column.
_RAW_EXCERPT_CHARS = 500


class LLMResponseError(Exception):
    """Base class for a structurally unusable LLM response.

    Carries `.message` so routers can map it onto `ErrorResponse` the same way
    they already handle `WorkflowError` (see services/exploration.py).
    """

    def __init__(
        self,
        message: str,
        *,
        stage: str,
        model: str,
        finish_reason: Optional[str] = None,
        raw_excerpt: Optional[str] = None,
    ):
        self.message = message
        self.stage = stage
        self.model = model
        self.finish_reason = finish_reason
        self.raw_excerpt = raw_excerpt
        super().__init__(message)


class LLMTruncatedResponseError(LLMResponseError):
    """The completion hit the output-token ceiling (`finish_reason="length"`).

    The payload is a prefix of a JSON document and can never parse. Recoverable
    only by making the request smaller.
    """


class LLMEmptyResponseError(LLMResponseError):
    """The completion carried no content (refusal, content filter, empty choice)."""


class LLMInvalidJSONError(LLMResponseError):
    """The completion finished normally but the payload did not parse."""


class LLMBadRequestError(LLMResponseError):
    """The API rejected the request with a 400 (deterministic; never retried)."""


class LLMRequestTooLargeError(LLMBadRequestError):
    """The rendered prompt exceeded the model's context window.

    Distinct from `LLMTruncatedResponseError`: that one is the *output* running
    past `max_tokens` mid-generation, this one is the *input* being refused
    before generation starts. Both are size problems, but they are fixed in
    opposite places — the former by shrinking the batch, the latter by shrinking
    the per-request context (persona payload, rules, schema).
    """


def _excerpt(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    return raw[:_RAW_EXCERPT_CHARS]


def parse_json_object(
    response: Any,
    *,
    stage: str,
    model: str,
) -> Dict[str, Any]:
    """Validate an OpenAI chat completion and return its parsed JSON object.

    Raises the `LLMResponseError` subclass matching the failure mode. Never
    raises `JSONDecodeError` or `TypeError` at the caller.
    """
    try:
        choice = response.choices[0]
    except (AttributeError, IndexError):
        raise LLMEmptyResponseError(
            "The AI service returned no completion.",
            stage=stage,
            model=model,
        )

    finish_reason = getattr(choice, "finish_reason", None)
    raw = getattr(choice.message, "content", None)

    # Order matters: check truncation before parsing. A truncated payload fails
    # to parse too, but reporting it as "invalid JSON" would send whoever reads
    # the log hunting for a prompt-formatting bug instead of a size problem.
    if finish_reason == "length":
        raise LLMTruncatedResponseError(
            "The AI response was cut off before it finished. The request was too "
            "large for the model's output limit.",
            stage=stage,
            model=model,
            finish_reason=finish_reason,
            raw_excerpt=_excerpt(raw),
        )

    if not raw or not raw.strip():
        raise LLMEmptyResponseError(
            "The AI service returned an empty response.",
            stage=stage,
            model=model,
            finish_reason=finish_reason,
        )

    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise LLMInvalidJSONError(
            "The AI service returned a malformed response.",
            stage=stage,
            model=model,
            finish_reason=finish_reason,
            raw_excerpt=_excerpt(raw),
        ) from exc

    if not isinstance(data, dict):
        raise LLMInvalidJSONError(
            "The AI service returned an unexpected response shape.",
            stage=stage,
            model=model,
            finish_reason=finish_reason,
            raw_excerpt=_excerpt(raw),
        )

    return data


async def call_json_object(
    client: AsyncOpenAI,
    *,
    model: str,
    messages: List[Dict[str, str]],
    stage: str,
    max_tokens: int = OPENAI_MAX_OUTPUT_TOKENS,
    temperature: Optional[float] = None,
    max_attempts: int = 2,
    operation: Optional[str] = None,
    usage: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run a JSON-mode chat completion and return the parsed object.

    `usage` forwards identifying columns to `record_llm_usage` — at minimum
    `exploration_id`, optionally `workspace_id` / `persona_id` / `created_by`.
    Usage is recorded on success *and* on failure (`status="error"`), so a
    failed generation stays visible in `llm_usage_event` rather than vanishing.

    Raises `LLMResponseError` (subclass) when the response is unusable after
    `max_attempts`. See the module docstring for what is and isn't retried.
    """
    usage_ctx = dict(usage or {})
    exploration_id = usage_ctx.pop("exploration_id", None)

    kwargs: Dict[str, Any] = {
        "model": model,
        "response_format": {"type": "json_object"},
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if temperature is not None:
        kwargs["temperature"] = temperature

    last_error: Optional[LLMResponseError] = None

    for attempt in range(1, max_attempts + 1):
        started = time.monotonic()
        try:
            res = await client.chat.completions.create(**kwargs)
        except BadRequestError as exc:
            # A 400 means the request itself is invalid — overwhelmingly
            # context_length_exceeded. It is deterministic (an identical retry
            # fails identically) and the SDK does not retry it either, so
            # translate it into our own hierarchy and hand it straight back.
            # Without this the raw openai.BadRequestError escapes the service
            # and the router entirely, surfacing to the client as a bare 500.
            body = getattr(exc, "body", None)
            code = body.get("code") if isinstance(body, dict) else None
            detail = (body.get("message") if isinstance(body, dict) else None) or str(exc)

            err_cls = (
                LLMRequestTooLargeError
                if code == "context_length_exceeded"
                else LLMBadRequestError
            )
            err = err_cls(
                "The request sent to the AI service was too large for its context window."
                if err_cls is LLMRequestTooLargeError
                else "The AI service rejected the request.",
                stage=stage,
                model=model,
                raw_excerpt=_excerpt(detail),
            )
            if exploration_id:
                await record_llm_usage(
                    exploration_id=exploration_id,
                    stage=stage,
                    operation=operation,
                    provider="openai",
                    model=model,
                    input_tokens=0,
                    output_tokens=0,
                    latency_ms=int((time.monotonic() - started) * 1000),
                    status="error",
                    error_message=f"{type(err).__name__}: {code or 'bad_request'}",
                    **usage_ctx,
                )
            logger.error(
                "LLM request rejected [stage=%s model=%s code=%s max_tokens=%d] %s",
                stage, model, code, max_tokens, detail,
            )
            raise err from exc

        latency_ms = int((time.monotonic() - started) * 1000)

        input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(res)

        try:
            data = parse_json_object(res, stage=stage, model=model)
        except LLMResponseError as exc:
            last_error = exc
            # Recorded from a real except block (not one added solely to write
            # an error row) — see the contract on record_llm_usage.
            if exploration_id:
                await record_llm_usage(
                    exploration_id=exploration_id,
                    stage=stage,
                    operation=operation,
                    provider="openai",
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    usage_raw=usage_raw,
                    latency_ms=latency_ms,
                    status="error",
                    error_message=f"{type(exc).__name__}: {exc.message}",
                    **usage_ctx,
                )
            logger.warning(
                "LLM JSON call failed [stage=%s model=%s attempt=%d/%d error=%s "
                "finish_reason=%s output_tokens=%s max_tokens=%d] excerpt=%r",
                stage,
                model,
                attempt,
                max_attempts,
                type(exc).__name__,
                exc.finish_reason,
                output_tokens,
                max_tokens,
                exc.raw_excerpt,
            )

            # Truncation is deterministic — a retry of the same request burns
            # tokens and latency to fail identically. Hand it straight back so
            # the caller can shrink the request instead.
            if isinstance(exc, LLMTruncatedResponseError) or attempt == max_attempts:
                raise
            continue

        if exploration_id:
            await record_llm_usage(
                exploration_id=exploration_id,
                stage=stage,
                operation=operation,
                provider="openai",
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                usage_raw=usage_raw,
                latency_ms=latency_ms,
                **usage_ctx,
            )

        if attempt > 1:
            logger.info(
                "LLM JSON call recovered on retry [stage=%s model=%s attempt=%d]",
                stage,
                model,
                attempt,
            )
        return data

    # Unreachable: the loop either returns or raises. Guards against a future
    # edit making max_attempts <= 0 silently return None.
    raise last_error or LLMEmptyResponseError(
        "The AI service returned no usable response.", stage=stage, model=model
    )
