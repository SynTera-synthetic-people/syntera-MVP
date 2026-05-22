"""
Normalize LLM survey simulation output to canonical questionnaire keys and option labels.

Ensures:
- Results are keyed by exact question text from the questionnaire (fixes UI/CSV zeros from key drift).
- Counts sum to total sample size.
- When possible, every listed option gets at least one synthetic respondent (no all-zero options).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional


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
    if index < len(llm_rows):
        return llm_rows[index]
    ct = _norm_label(canonical_text)
    for r in llm_rows:
        if _norm_label(r.get("text", "") or "") == ct:
            return r
    return None


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
) -> Dict[str, Any]:
    """
    Question-keyed result envelope for the new question engine.

    `legacy_results` remains the stable public shape used by existing reports:
    {question_text: [{option,count,pct}]}.  This wrapper keeps that data but
    indexes it by immutable question_key so wording edits do not orphan results.
    """
    questions: Dict[str, Any] = {}
    order: List[str] = []

    for index, q in enumerate(flat_questions, start=1):
        qtext = (q.get("text") or "").strip()
        qkey = str(q.get("question_key") or q.get("id") or f"Q{index}")
        result_block = legacy_results.get(qtext, [])
        config = q.get("config") or {}
        option_schema = q.get("option_schema") or config.get("options") or []
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
            "total": total_sample_size,
        }

    return {
        "schema_version": 1,
        "result_key": "question_key",
        "total_sample_size": total_sample_size,
        "order": order,
        "questions": questions,
    }
