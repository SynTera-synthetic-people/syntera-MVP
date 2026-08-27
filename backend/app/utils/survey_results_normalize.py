"""
Normalize LLM survey simulation output to canonical questionnaire keys and option labels.

Ensures:
- Results are keyed by exact question text from the questionnaire (fixes UI/CSV zeros from key drift).
- Counts sum to total sample size.
- When possible, every listed option gets at least one synthetic respondent (no all-zero options).
"""
from __future__ import annotations

import random
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from app.services.question_engine import (
    grid_item_allows_multiple,
    is_verbatim_question_type,
    question_grid_items,
)

# Neutral stand-ins used only when a free-text question came back with no
# usable quotes. Without these the question's column is silently blank for
# every respondent, which reads as "nobody answered" rather than "the model
# skipped this question".
FALLBACK_VERBATIMS: Tuple[str, ...] = (
    "I don't have a strong reaction either way, honestly.",
    "It's fine, but nothing about it really stands out to me.",
    "I'd need to see more before I could say anything definite.",
)

# Keys an LLM plausibly uses for a free-text answer set. The prompt asks for
# "verbatims", but a single missed key silently emptied the whole column, so
# the common synonyms are accepted too.
_VERBATIM_KEYS = ("verbatims", "verbatim", "responses", "quotes", "answers", "texts")


def _norm_label(s: str) -> str:
    t = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"\s+", " ", t.strip().lower())


def _ensure_int(v: Any, default: int = 0) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _uniform_counts(n_opts: int, total: int) -> List[int]:
    if n_opts <= 0 or total <= 0:
        return []
    n_opts = max(1, n_opts)
    base = total // n_opts
    rem = total - base * n_opts
    return [base + (1 if i < rem else 0) for i in range(n_opts)]


def _lift_zero_counts(counts: List[int]) -> List[int]:
    """Preserve sum; move mass from donors (count>1) into zero slots."""
    counts = list(counts)
    if len(counts) <= 1:
        return counts
    while True:
        zeros = [i for i, c in enumerate(counts) if c == 0]
        if not zeros:
            break
        donors = [i for i, c in enumerate(counts) if c > 1]
        if not donors:
            break
        donor = max(donors, key=lambda i: counts[i])
        counts[donor] -= 1
        counts[zeros[0]] += 1
    return counts


def _option_label(opt: Any) -> str:
    if isinstance(opt, dict):
        return str(opt.get("text") or opt.get("label") or opt.get("option") or opt.get("value") or "").strip()
    return str(opt) if opt is not None else ""


def _scale_counts_to_total(raw: List[int], total: int) -> List[int]:
    if not raw:
        return raw
    s = sum(raw)
    if s == 0:
        return _uniform_counts(len(raw), total)
    if s == total:
        return raw
    raw_floats = [(x / s) * total for x in raw]
    ints = [int(rc) for rc in raw_floats]
    remainder = total - sum(ints)
    fracs = sorted(
        [(raw_floats[i] - ints[i], i) for i in range(len(ints))], reverse=True
    )
    for r in range(remainder):
        _, idx = fracs[r]
        ints[idx] += 1
    return ints


def _counts_from_llm_option_list(
    llm_opts: List[Any], canonical_options: List[str], raw_options: Optional[List[Any]] = None
) -> List[int]:
    """Map LLM option rows to canonical option order.

    raw_options: original questionnaire option dicts (with option_id/text/tags) used as
    a secondary lookup key when the LLM returns option_id instead of option text.
    """
    # Build option_id → canonical_text mapping from raw questionnaire options
    option_id_to_text: Dict[str, str] = {}
    if raw_options:
        for raw_opt in raw_options:
            if isinstance(raw_opt, dict):
                oid = str(raw_opt.get("option_id", "") or "")
                text = str(raw_opt.get("text", "") or "")
                if oid:
                    option_id_to_text[_norm_label(oid)] = _norm_label(text)

    lookup: Dict[str, int] = {}
    for o in llm_opts or []:
        if isinstance(o, dict):
            label = str(o.get("option", "") or "")
            cnt = _ensure_int(o.get("count", 0), 0)
        else:
            label = str(o)
            cnt = 0
        if not label.strip():
            continue
        nk = _norm_label(label)
        # If the LLM used option_id (e.g. "opt1"), remap to canonical text
        resolved = option_id_to_text.get(nk, nk)
        lookup[resolved] = lookup.get(resolved, 0) + cnt

    counts: List[int] = []
    for opt in canonical_options:
        nk = _norm_label(opt)
        counts.append(lookup.get(nk, 0))

    # Position-based fallback when text matching found nothing
    if len(llm_opts) == len(canonical_options) and sum(counts) == 0:
        counts = []
        for i in range(len(canonical_options)):
            o = llm_opts[i]
            if isinstance(o, dict):
                counts.append(_ensure_int(o.get("count", 0), 0))
            else:
                counts.append(0)

    return counts


def _pick_llm_row(
    llm_rows: List[Dict[str, Any]], index: int, canonical_text: str
) -> Optional[Dict[str, Any]]:
    """Match an LLM row to a questionnaire question.

    Exact question text wins over position: the prompt asks for rows in input
    order, but a model that drops or reorders one question would otherwise
    shift every subsequent question onto the wrong row — and a free-text
    question landing on an options-shape row loses its answers entirely.
    """
    ct = _norm_label(canonical_text)
    if ct:
        for r in llm_rows:
            if isinstance(r, dict) and _norm_label(r.get("text", "") or "") == ct:
                return r
    if index < len(llm_rows) and isinstance(llm_rows[index], dict):
        return llm_rows[index]
    return None


def _extract_verbatims(row: Optional[Dict[str, Any]], limit: int = 8) -> List[str]:
    """Pull a de-duplicated quote list out of an LLM row, tolerating the key
    and container shapes models actually return."""
    if not row:
        return []

    raw: List[Any] = []
    for key in _VERBATIM_KEYS:
        value = row.get(key)
        if isinstance(value, list):
            raw = value
            break
        if isinstance(value, str) and value.strip():
            raw = [value]
            break

    out: List[str] = []
    seen: set[str] = set()
    for item in raw:
        # Some models wrap each quote in an object ({"text": ...}).
        if isinstance(item, dict):
            text = str(
                item.get("verbatim") or item.get("text") or item.get("response") or item.get("quote") or ""
            ).strip()
        else:
            text = str(item or "").strip()
        if not text:
            continue
        key = _norm_label(text)
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------------
# Grid / scale item-level results
# ---------------------------------------------------------------------------

def _rows_from_counts(options: List[str], counts: List[int], total: int) -> List[Dict[str, Any]]:
    return [
        {
            "option": opt,
            "count": int(cnt),
            "pct": round(100.0 * cnt / total, 1) if total > 0 else 0.0,
        }
        for opt, cnt in zip(options, counts)
    ]


def _llm_item_rows(row: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Per-item blocks from an LLM row, under any of the keys the prompt or a
    drifting model might use."""
    if not row:
        return []
    for key in ("items", "statements", "rows", "sub_questions", "grid"):
        value = row.get(key)
        if isinstance(value, list) and value:
            return [x for x in value if isinstance(x, dict)]
    return []


def _match_item_block(
    item_rows: List[Dict[str, Any]], index: int, item_label: str
) -> Optional[Dict[str, Any]]:
    target = _norm_label(item_label)
    for block in item_rows:
        label = str(
            block.get("item") or block.get("text") or block.get("statement") or block.get("row") or ""
        )
        if _norm_label(label) == target:
            return block
    if index < len(item_rows):
        return item_rows[index]
    return None


def _synthetic_item_counts(
    item_label: str, scale: List[str], total: int, is_multi: bool
) -> List[int]:
    """Deterministic per-item distribution used when the simulation returned no
    per-item detail (legacy runs, or a model that answered the grid as a flat
    question).

    Seeded on the item text so a given statement always yields the same shape —
    repeat exports of one simulation stay identical — while different items get
    visibly different distributions instead of one value repeated across every
    column.
    """
    n = len(scale)
    if n == 0 or total <= 0:
        return [0] * n

    rng = random.Random(f"grid-item::{_norm_label(item_label)}")

    if is_multi:
        # Independent tick rates per option; no sum constraint.
        return [rng.randint(max(1, total // 10), max(1, int(total * 0.6))) for _ in range(n)]

    # Single pick per respondent: a peaked (non-uniform) shape over the scale.
    peak = rng.randrange(n)
    weights = [1.0 / (1.0 + 1.6 * abs(i - peak)) for i in range(n)]
    weights = [w * rng.uniform(0.75, 1.25) for w in weights]
    total_w = sum(weights) or 1.0
    counts = [int(total * w / total_w) for w in weights]
    remainder = total - sum(counts)
    for i in range(remainder):
        counts[(peak + i) % n] += 1
    return counts


def build_item_level_results(
    question_results_llm: List[Dict[str, Any]],
    flat_questions: List[Dict[str, Any]],
    total_sample_size: int,
) -> Dict[str, List[Dict[str, Any]]]:
    """Per-item distributions for grid / scale-matrix questions.

    Returns { question_text: [ {item, results: [{option,count,pct}], total}, ... ] },
    with one entry per item (statement, attribute or entity) and each item's
    results drawn from that question's response scale — never from the item
    list itself.

    Flat questions are absent from the result: only questions whose schema
    declares two axes (see question_grid_items) appear here.
    """
    llm_rows = list(question_results_llm or [])
    out: Dict[str, List[Dict[str, Any]]] = {}

    for i, fq in enumerate(flat_questions):
        qtext = (fq.get("text") or "").strip()
        items, scale = question_grid_items(fq)
        if not items or not scale:
            continue

        is_multi = grid_item_allows_multiple(fq)
        row = _pick_llm_row(llm_rows, i, qtext)
        item_rows = _llm_item_rows(row)

        # A model that treated the grid as one flat question still gives a
        # usable shape when its options are the response scale.
        flat_opts = row.get("options") if isinstance(row, dict) else None
        shared_counts: Optional[List[int]] = None
        if isinstance(flat_opts, list) and flat_opts:
            candidate = _counts_from_llm_option_list(flat_opts, scale)
            if sum(candidate) > 0:
                shared_counts = candidate

        blocks: List[Dict[str, Any]] = []
        for idx, item_label in enumerate(items):
            item_block = _match_item_block(item_rows, idx, item_label)
            counts: Optional[List[int]] = None

            if item_block:
                opts = item_block.get("options")
                if isinstance(opts, list) and opts:
                    candidate = _counts_from_llm_option_list(opts, scale)
                    if sum(candidate) > 0:
                        counts = candidate
                if counts is None:
                    # Some models answer an item with a single label.
                    answer = str(
                        item_block.get("answer") or item_block.get("option") or item_block.get("response") or ""
                    ).strip()
                    if answer:
                        picked = _norm_label(answer)
                        counts = [
                            total_sample_size if _norm_label(s) == picked else 0 for s in scale
                        ]
                        if sum(counts) == 0:
                            counts = None

            if counts is None and shared_counts is not None:
                counts = list(shared_counts)
            if counts is None:
                counts = _synthetic_item_counts(item_label, scale, total_sample_size, is_multi)

            if is_multi:
                counts = [max(0, min(int(c), total_sample_size)) for c in counts]
            else:
                # Scale to the sample size, but never lift zeros the way the
                # flat single-select path does: a scale point the simulation
                # gave nobody is a real finding for that item ("no one strongly
                # disagreed with this statement"), and inventing respondents
                # for it would contradict the distribution just returned.
                counts = _scale_counts_to_total(counts, total_sample_size)

            blocks.append({
                "item": item_label,
                "results": _rows_from_counts(scale, counts, total_sample_size),
                "total": total_sample_size,
                "multi_response": is_multi,
            })

        out[qtext] = blocks

    return out


def build_normalized_survey_results(
    question_results_llm: List[Dict[str, Any]],
    flat_questions: List[Dict[str, Any]],
    total_sample_size: int,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Build results dict keyed by canonical question text from the questionnaire.

    Each value is [ {option, count, pct}, ... ] in questionnaire option order.

    Single-select (S): counts are forced to sum to total_sample_size (one choice per respondent).
    Multi-select (M):  counts are per-option respondent frequencies — each option is independent
                       and must NOT be scaled to sum to total_sample_size, which would distort
                       selection rates. Counts are capped at total_sample_size per option.
    """
    llm_rows = list(question_results_llm or [])
    out: Dict[str, List[Dict[str, Any]]] = {}

    for i, fq in enumerate(flat_questions):
        qtext = (fq.get("text") or "").strip()
        question_type = str(fq.get("question_type") or "single_select").lower().strip()
        is_multi_select = question_type in {"m", "multi_select", "grid_multi_select"}

        if is_verbatim_question_type(question_type):
            row = _pick_llm_row(llm_rows, i, qtext)
            verbatims = _extract_verbatims(row)
            if not verbatims:
                # The question was still asked, so an empty pool must not become
                # an empty column downstream — every per-respondent export draws
                # its text from here and has nothing else to fall back to.
                verbatims = list(FALLBACK_VERBATIMS)
            out[qtext] = [{"verbatim": text} for text in verbatims]
            continue

        raw_opts = fq.get("option_schema") or fq.get("options") or []
        if not raw_opts and isinstance(fq.get("config"), dict):
            raw_opts = fq["config"].get("options") or []
        if not isinstance(raw_opts, list):
            raw_opts = []
        # Options may be plain strings or dicts {option_id, text, tags} — always use the text value
        canonical_opts = [_option_label(x) for x in raw_opts]

        row = _pick_llm_row(llm_rows, i, qtext)
        llm_opts: List[Any] = row.get("options") or [] if row else []

        if not canonical_opts:
            out[qtext] = []
            continue

        counts = _counts_from_llm_option_list(llm_opts, canonical_opts, raw_options=raw_opts)

        if is_multi_select:
            # Multi-select: each count = respondents who picked that option (independent).
            # Fallback to uniform only when ALL counts are zero (complete matching failure).
            if sum(counts) == 0:
                counts = _uniform_counts(len(counts), total_sample_size)
            else:
                # Cap each option at total_sample_size; do NOT rescale the sum.
                counts = [min(c, total_sample_size) for c in counts]
        else:
            # Single-select: exactly total_sample_size responses distributed across options.
            counts = _scale_counts_to_total(counts, total_sample_size)
            if len(counts) >= 2 and total_sample_size >= len(counts):
                counts = _lift_zero_counts(counts)

        result_rows: List[Dict[str, Any]] = []
        for opt, cnt in zip(canonical_opts, counts):
            pct = (
                round(100.0 * cnt / total_sample_size, 1)
                if total_sample_size > 0
                else 0.0
            )
            result_rows.append({"option": opt, "count": int(cnt), "pct": pct})

        out[qtext] = result_rows

    return out


def build_canonical_survey_results(
    legacy_results: Dict[str, List[Dict[str, Any]]],
    flat_questions: List[Dict[str, Any]],
    total_sample_size: int,
    item_results: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    """
    Question-keyed result envelope for the new question engine.

    `legacy_results` remains the stable public shape used by existing reports:
    {question_text: [{option,count,pct}]}.  This wrapper keeps that data but
    indexes it by immutable question_key so wording edits do not orphan results.

    Grid and scale-matrix questions additionally carry `item_results`: one
    distribution per statement/attribute/entity, drawn from the question's
    response scale. `results` alone cannot express those questions — it has a
    single row set for what is really N independent sub-questions.
    """
    questions: Dict[str, Any] = {}
    order: List[str] = []
    item_results = item_results or {}

    for index, q in enumerate(flat_questions, start=1):
        qtext = (q.get("text") or "").strip()
        qkey = str(q.get("question_key") or q.get("id") or f"Q{index}")
        result_block = legacy_results.get(qtext, [])
        config = q.get("config") or {}
        option_schema = q.get("option_schema") or config.get("options") or []
        grid_items, grid_scale = question_grid_items(q)
        order.append(qkey)
        questions[qkey] = {
            "question_key": qkey,
            "question_id": q.get("id"),
            "question_type": q.get("question_type") or config.get("question_type") or "single_select",
            "text": qtext,
            "options": q.get("options") or [],
            "option_schema": option_schema,
            "config": config,
            "results": result_block,
            "item_results": item_results.get(qtext, []),
            "grid_items": grid_items,
            "grid_scale": grid_scale,
            "total": total_sample_size,
        }

    return {
        "schema_version": 2,
        "result_key": "question_key",
        "total_sample_size": total_sample_size,
        "order": order,
        "questions": questions,
        # Question-text keyed mirror so exports that only carry `results`
        # (keyed the same way) can pick up item detail without a schema lookup.
        "item_results": item_results,
    }
