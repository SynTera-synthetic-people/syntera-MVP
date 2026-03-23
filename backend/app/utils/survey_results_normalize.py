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
    llm_opts: List[Any], canonical_options: List[str]
) -> List[int]:
    """Map LLM option rows to canonical option order."""
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
        lookup[nk] = lookup.get(nk, 0) + cnt

    counts: List[int] = []
    for opt in canonical_options:
        nk = _norm_label(opt)
        counts.append(lookup.get(nk, 0))

    # position fallback if same length and all zero but lookup had values
    if len(llm_opts) == len(canonical_options) and sum(counts) == 0:
        counts = []
        for i, opt in enumerate(canonical_options):
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
    """
    llm_rows = list(question_results_llm or [])
    out: Dict[str, List[Dict[str, Any]]] = {}

    for i, fq in enumerate(flat_questions):
        qtext = (fq.get("text") or "").strip()
        canonical_opts = fq.get("options") or []
        if not isinstance(canonical_opts, list):
            canonical_opts = []
        canonical_opts = [str(x) if x is not None else "" for x in canonical_opts]

        row = _pick_llm_row(llm_rows, i, qtext)
        if not row:
            llm_opts: List[Any] = []
        else:
            llm_opts = row.get("options") or []

        if not canonical_opts:
            out[qtext] = []
            continue

        counts = _counts_from_llm_option_list(llm_opts, canonical_opts)
        counts = _scale_counts_to_total(counts, total_sample_size)

        # At least 1 respondent per option when sample allows
        if len(counts) >= 2 and total_sample_size >= len(counts):
            counts = _lift_zero_counts(counts)

        processed: List[Dict[str, Any]] = []
        for opt, cnt in zip(canonical_opts, counts):
            pct = (
                round(100.0 * cnt / total_sample_size, 1)
                if total_sample_size > 0
                else 0.0
            )
            processed.append({"option": opt, "count": int(cnt), "pct": pct})

        out[qtext] = processed

    return out
