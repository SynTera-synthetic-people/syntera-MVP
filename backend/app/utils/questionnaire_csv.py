"""Build questionnaire CSV: Q No., Question Description, Options, Count (per option)."""
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple


def _norm_key(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"\s+", " ", s.strip().lower())


def _ensure_option_list(opts: Any) -> List[str]:
    """DB JSON may rarely deserialize oddly; tolerate list or JSON string."""
    if opts is None:
        return []
    if isinstance(opts, list):
        return [str(x) if x is not None else "" for x in opts]
    if isinstance(opts, str):
        t = opts.strip()
        if not t:
            return []
        try:
            parsed = json.loads(t)
            if isinstance(parsed, list):
                return [str(x) if x is not None else "" for x in parsed]
        except json.JSONDecodeError:
            pass
    return []


def _find_block_by_question_text(
    counts_map: Dict[str, Any], q_text: str
) -> Optional[List[Dict[str, Any]]]:
    if not counts_map:
        return None
    qt = (q_text or "").strip()
    if qt in counts_map:
        block = counts_map[qt]
        return block if isinstance(block, list) else None
    nq = _norm_key(qt)
    for k, v in counts_map.items():
        if not isinstance(k, str):
            continue
        if k.strip() == qt:
            return v if isinstance(v, list) else None
    for k, v in counts_map.items():
        if isinstance(k, str) and _norm_key(k) == nq:
            return v if isinstance(v, list) else None
    return None


def _option_overlap_score(
    q_options: List[str], block: Optional[List[Dict[str, Any]]]
) -> float:
    """Fraction of questionnaire options that appear among survey option labels."""
    if not q_options or not block or not isinstance(block, list):
        return 0.0
    bo = {
        _norm_key(str(x.get("option", "")))
        for x in block
        if isinstance(x, dict) and str(x.get("option", "")).strip()
    }
    qo = {_norm_key(o) for o in q_options if o is not None and str(o).strip()}
    if not qo:
        return 0.0
    inter = len(qo & bo)
    return inter / len(qo)


def _align_blocks_to_questions(
    counts_map: Optional[Dict[str, Any]],
    flat_questions: List[Tuple[str, List[str]]],
) -> List[Optional[List[Dict[str, Any]]]]:
    """
    One-to-one map: each questionnaire row ↔ one survey block (same order as simulation
    when possible; otherwise best option-label overlap).
    """
    n = len(flat_questions)
    if not counts_map or n == 0:
        return [None] * n

    ordered = [v for v in counts_map.values() if isinstance(v, list)]
    m = len(ordered)
    if m == 0:
        return [None] * n

    # Score matrix: (question_i, survey_block_j) -> weight
    pairs: List[Tuple[float, int, int]] = []
    for i in range(n):
        q_text, q_opts = flat_questions[i]
        text_block = _find_block_by_question_text(counts_map, q_text)
        for j in range(m):
            ov = _option_overlap_score(q_opts, ordered[j])
            if text_block is not None and text_block is ordered[j]:
                # Strong preference for fuzzy text match
                sc = 10.0 + ov
            elif not q_opts:
                # No options stored — trust simulation order (or weak text-only elsewhere)
                sc = 0.35 if i == j else 0.0
            else:
                # Prefer same index (simulation order) when overlaps tie
                sc = ov + (0.02 if i == j else 0.0)
            pairs.append((sc, i, j))

    pairs.sort(reverse=True, key=lambda t: (t[0], -t[2], -t[1]))
    used_i: set[int] = set()
    used_j: set[int] = set()
    blocks: List[Optional[List[Dict[str, Any]]]] = [None] * n

    min_take = 0.15
    for sc, i, j in pairs:
        if sc < min_take:
            break
        if i in used_i or j in used_j:
            continue
        blocks[i] = ordered[j]
        used_i.add(i)
        used_j.add(j)

    # Second pass: lower threshold for stragglers
    for sc, i, j in pairs:
        if i in used_i or j in used_j:
            continue
        if sc < 0.05:
            break
        blocks[i] = ordered[j]
        used_i.add(i)
        used_j.add(j)

    # Third: still unassigned — same index, then any remaining block (handles paraphrased options)
    for i in range(n):
        if blocks[i] is not None:
            continue
        if i < m and i not in used_j:
            blocks[i] = ordered[i]
            used_i.add(i)
            used_j.add(i)
    unused_j = [j for j in range(m) if j not in used_j]
    ui = 0
    for i in range(n):
        if blocks[i] is not None:
            continue
        if ui < len(unused_j):
            blocks[i] = ordered[unused_j[ui]]
            ui += 1

    return blocks


def _counts_for_options(
    block: Optional[List[Dict[str, Any]]], options: List[str]
) -> List[int]:
    """Match option labels; if all unmatched but row counts exist, use index order."""
    if not options:
        return []
    if not block or not isinstance(block, list):
        return [0] * len(options)

    cleaned = [x for x in block if isinstance(x, dict)]
    if not cleaned:
        return [0] * len(options)

    out: List[int] = []
    for o in options:
        key = str(o).strip() if o is not None else ""
        cnt: Optional[int] = None
        for item in cleaned:
            ot = str(item.get("option", "")).strip()
            if ot == key or _norm_key(ot) == _norm_key(key):
                try:
                    cnt = int(item.get("count", 0) or 0)
                except (TypeError, ValueError):
                    cnt = 0
                break
        out.append(cnt if cnt is not None else 0)

    if sum(out) == 0 and len(cleaned) == len(options):
        idx: List[int] = []
        for i in range(len(options)):
            try:
                idx.append(int(cleaned[i].get("count", 0) or 0))
            except (TypeError, ValueError):
                idx.append(0)
        if sum(idx) > 0:
            return idx

    return out


def questionnaire_sections_to_csv_bytes(
    sections: List[Dict[str, Any]],
    counts_map: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    One row per question-option: Q No., Question Description, Options, Count.

    counts_map: optional { question_text: [ {option, count}, ... ] } from SurveySimulation.results
    """
    if not sections:
        return b""

    flat: List[Tuple[str, List[str]]] = []
    for sec in sections:
        for q in sec.get("questions") or []:
            q_text = (q.get("text") or "").strip()
            opts = _ensure_option_list(q.get("options"))
            flat.append((q_text, opts))

    aligned = _align_blocks_to_questions(counts_map, flat)

    header = ["Q No.", "Question Description", "Options", "Count"]
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)

    for q_no, ((q_text, opts), block) in enumerate(zip(flat, aligned), start=1):
        if opts:
            counts = _counts_for_options(block, opts)
            for opt, cnt in zip(opts, counts):
                writer.writerow([q_no, q_text, opt if opt is not None else "", cnt])
        elif block and isinstance(block, list):
            for item in block:
                if isinstance(item, dict):
                    writer.writerow(
                        [
                            q_no,
                            q_text,
                            str(item.get("option", "")),
                            int(item.get("count", 0) or 0),
                        ]
                    )
        else:
            writer.writerow([q_no, q_text, "", 0])

    return ("\ufeff" + buffer.getvalue()).encode("utf-8")
