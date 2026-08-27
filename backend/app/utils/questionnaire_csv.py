"""Build questionnaire CSVs, with optional response counts for Raw Data Shell."""
from __future__ import annotations

import csv
import io
import json
import random
import re
import unicodedata
import zipfile
from typing import Any, Dict, List, Optional, Tuple


def _norm_key(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"\s+", " ", s.strip().lower())


def _ensure_option_list(opts: Any) -> List[str]:
    """DB JSON may rarely deserialize oddly; tolerate list or JSON string.
    Options may be plain strings or dicts {option_id, text, tags} — always extract text.
    """
    def _opt_text(x: Any) -> str:
        if x is None:
            return ""
        if isinstance(x, dict):
            return str(x.get("text") or x.get("label") or x.get("option") or x.get("value") or "")
        return str(x)

    if opts is None:
        return []
    if isinstance(opts, list):
        return [_opt_text(x) for x in opts]
    if isinstance(opts, str):
        t = opts.strip()
        if not t:
            return []
        try:
            parsed = json.loads(t)
            if isinstance(parsed, list):
                return [_opt_text(x) for x in parsed]
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
    include_count: bool = False,
    item_results: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> bytes:
    """
    One row per question-option.

    Default output is the questionnaire design export:
    Q No., Question Description, Sub-Question, Options.

    Raw Data Shell can opt in to response counts:
    Q No., Question Description, Sub-Question, Options, Count.

    counts_map: optional { question_text: [ {option, count}, ... ] } from SurveySimulation.results

    item_results: optional { question_text: [ {item, results:[{option,count}]}, ... ] } for grid /
      scale-matrix questions. A Likert battery or grid is really N sub-questions sharing one
      response scale, so `counts_map` alone cannot describe it — its single block is keyed by the
      item axis, which makes a statement look like the chosen answer. When present, each item is
      emitted as its own sub-question (O1_, O2_, …) with a full row per scale option, and
      `Sub-Question` stays blank for every other question type.
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
    item_results = item_results or {}

    header = ["Q No.", "Question Description", "Sub-Question", "Options"]
    if include_count:
        header.append("Count")
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)

    for q_no, ((q_text, opts), block) in enumerate(zip(flat, aligned), start=1):
        item_blocks = _grid_item_blocks(item_results.get(q_text))
        if item_blocks:
            # Grid / scale-matrix question: analyse each statement, attribute or
            # entity on its own, against the scale the respondent actually
            # answered on. Multi-response grids keep independent per-option
            # frequencies \u2014 their counts are not rescaled to the sample size.
            for item_no, item_block in enumerate(item_blocks, start=1):
                sub_question = f"O{item_no}_{item_block.get('item', '')}"
                for result in item_block.get("results") or []:
                    if not isinstance(result, dict):
                        continue
                    try:
                        count = int(result.get("count", 0) or 0)
                    except (TypeError, ValueError):
                        count = 0
                    row = [q_no, q_text, sub_question, str(result.get("option", ""))]
                    if include_count:
                        row.append(count)
                    writer.writerow(row)
            continue

        if opts:
            counts = _counts_for_options(block, opts)
            for opt, count in zip(opts, counts):
                row = [q_no, q_text, "", opt if opt is not None else ""]
                if include_count:
                    row.append(count)
                writer.writerow(row)
        elif block and isinstance(block, list):
            for item in block:
                if isinstance(item, dict):
                    if "verbatim" in item:
                        # Open-ended question: no option/count semantics, just the quote.
                        row = [q_no, q_text, "", str(item.get("verbatim", ""))]
                        if include_count:
                            row.append("")
                        writer.writerow(row)
                        continue
                    try:
                        count = int(item.get("count", 0) or 0)
                    except (TypeError, ValueError):
                        count = 0
                    row = [q_no, q_text, "", str(item.get("option", ""))]
                    if include_count:
                        row.append(count)
                    writer.writerow(row)
        else:
            row = [q_no, q_text, "", ""]
            if include_count:
                row.append(0)
            writer.writerow(row)

    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


_MULTI_SELECT_TYPES = {"m", "multi_select", "grid_multi_select", "multiselect"}


def _is_multi_select_type(question_type: Optional[str]) -> bool:
    if not question_type:
        return False
    return str(question_type).strip().lower().replace("-", "_") in _MULTI_SELECT_TYPES


def _lookup_question_type(question_types: Dict[str, str], q_text: str) -> Optional[str]:
    if q_text in question_types:
        return question_types[q_text]
    nk = _norm_key(q_text)
    for k, v in question_types.items():
        if _norm_key(k) == nk:
            return v
    return None


def _exact_single_select_assignment(
    rng: random.Random, opts: List[str], counts: List[int], n: int
) -> List[str]:
    """One option per respondent; tally of assignments equals `counts` exactly."""
    pool: List[str] = []
    for opt, c in zip(opts, counts):
        pool.extend([opt] * max(int(c), 0))
    if len(pool) < n:
        pool.extend([opts[-1] if opts else ""] * (n - len(pool)))
    elif len(pool) > n:
        # Shuffle before trimming: the pool is built in option order, so
        # slicing it first would drop whole options off the tail of the scale
        # rather than thinning every option proportionally.
        rng.shuffle(pool)
        pool = pool[:n]
    rng.shuffle(pool)
    return pool


def _exact_multi_select_assignment(
    rng: random.Random, opts: List[str], counts: List[int], n: int
) -> List[List[str]]:
    """Each option gets its own independent, exact-count assignment across respondents
    (multi-select options are not mutually exclusive), so a respondent can end up with
    zero, one, or several options \u2014 and each option's marginal tally equals `counts`.
    """
    flags_by_option: List[List[bool]] = []
    for _opt, c in zip(opts, counts):
        c = max(0, min(int(c), n))
        flags = [True] * c + [False] * (n - c)
        rng.shuffle(flags)
        flags_by_option.append(flags)

    picks: List[List[str]] = []
    for i in range(n):
        picks.append([opt for opt, flags in zip(opts, flags_by_option) if flags[i]])
    return picks


def _verbatim_pool(opts_data: Any) -> List[str]:
    """Extract the quote pool from a { "verbatim": "..." } row shape (open-ended
    questions) — distinct from the { "option", "count" } shape used elsewhere.
    """
    if not isinstance(opts_data, list):
        return []
    return [
        str(d.get("verbatim", "")).strip()
        for d in opts_data
        if isinstance(d, dict) and str(d.get("verbatim", "")).strip()
    ]


def _grid_item_blocks(raw: Any) -> List[Dict[str, Any]]:
    """Validate a question's item_results entry, keeping only items that
    actually carry a distribution. Returns [] for flat questions."""
    if not isinstance(raw, list):
        return []
    blocks: List[Dict[str, Any]] = []
    for block in raw:
        if not isinstance(block, dict):
            continue
        item = str(block.get("item", "") or "").strip()
        rows = block.get("results")
        if not item or not isinstance(rows, list) or not rows:
            continue
        blocks.append(block)
    return blocks


def _grid_columns_for_question(
    q_index: int,
    q_text: str,
    items: List[str],
) -> Tuple[List[str], List[str]]:
    """Column header + question-text-row entry for each item of a grid question.

    Header follows Q<n>_<nn>: <item text> so each statement/attribute/entity is
    identifiable on its own, and the parent question is repeated in the second
    row so an item column is never orphaned from what was asked.
    """
    headers = [f"Q{q_index}_{i:02d}: {item}" for i, item in enumerate(items, start=1)]
    text_row = [f"{q_text} — {item}" for item in items]
    return headers, text_row


def _assign_grid_item_responses(
    rng: random.Random,
    item_blocks: List[Dict[str, Any]],
    n: int,
) -> List[List[Any]]:
    """One exact-count assignment column per grid item.

    Returns a list parallel to `item_blocks`; each entry is the per-respondent
    response for that item. Items are assigned independently of one another, so
    a respondent's answer to statement 1 never leaks into statement 2's column.
    """
    columns: List[List[Any]] = []
    for block in item_blocks:
        rows = block.get("results") or []
        opts = [str(r.get("option", "")) for r in rows if isinstance(r, dict)]
        counts = [max(int(r.get("count", 0) or 0), 0) for r in rows if isinstance(r, dict)]
        if not opts:
            columns.append([""] * n)
            continue
        if block.get("multi_response") and sum(counts) > n:
            # Independent tick-boxes: a respondent may match several options.
            columns.append(_exact_multi_select_assignment(rng, opts, counts, n))
        else:
            columns.append(_exact_single_select_assignment(rng, opts, counts, n))
    return columns


def build_survey_results_csv_bytes(
    results: Dict[str, Any],
    persona_sample_sizes: Dict[str, int],
    persona_names_map: Dict[str, str],
    seed: Optional[str] = None,
    question_types: Optional[Dict[str, str]] = None,
    item_results: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> bytes:
    """
    Generates a per-respondent wide-format CSV matching the reference format:

    Row 1 (header):       Respondent_ID | Persona_Type | Persona_Sample_Size | Q1_<label> | Q2_<label> | ...
    Row 2 (question text): "" | "" | "" | <full Q1 text> | <full Q2 text> | ...
    Row 3+ (data):          per-respondent chosen options

    - results: { question_text: [ {option, count, pct?}, ... ] }  (SurveySimulation.results)
    - persona_sample_sizes: { persona_id: sample_size }
    - persona_names_map: { persona_id: persona_name }
    - seed: deterministic seed (use simulation_id) so same run always produces same CSV
    - question_types: { question_text: question_type } from the questionnaire (e.g. "single_select",
      "multi_select"). Used to decide whether a respondent can be assigned more than one option.
    - item_results: { question_text: [ {item, results:[{option,count}], multi_response}, ... ] } for
      grid / scale-matrix questions (Likert batteries, single- and multi-select grids). Each item
      expands into its own column — Q<n>_01, Q<n>_02, … — carrying that item's own answer drawn from
      the question's response scale. Without it such a question collapses into one column whose
      "answer" is a statement rather than a scale point, and whose unrelated item responses are
      flattened together into a single cell.

    Each respondent's per-question value(s) are drawn from an EXACT shuffled realization of the
    aggregate option counts in `results`, not independent weighted sampling \u2014 so the per-option
    tallies in this file always reconcile with questionnaire_overview.csv's Count column for the
    same simulation. Multi-select questions assign each option independently (a respondent can get
    0, 1, or several, joined by "; " in the cell); single-select questions assign exactly one.
    Since per-persona breakdowns are not stored separately, the aggregate distribution is used for
    all personas (consistent with what the simulation stores), but the exact-count pool is built once
    across the full respondent population so cross-persona totals still reconcile.
    """
    if not results or not persona_sample_sizes:
        return b""

    rng = random.Random(seed or "default")
    question_types = question_types or {}
    item_results = item_results or {}

    # Build ordered question list + short column labels
    # question_text -> [{option, count}]
    questions: List[str] = list(results.keys())

    def _short_label(text: str, idx: int) -> str:
        """Generate Q{n}_ShortLabel from question text."""
        # Take first 4 meaningful words, title-case, underscored
        words = re.sub(r"[^\w\s]", "", text or "").split()
        label = "_".join(w.title() for w in words[:4] if w)
        return f"Q{idx + 1}_{label}" if label else f"Q{idx + 1}"

    total_respondents = sum(max(int(v or 0), 0) for v in persona_sample_sizes.values())

    col_labels: List[str] = []
    question_text_row_cells: List[str] = []
    # One exact-count assignment pool per COLUMN, shared across all
    # respondents/personas. A grid question contributes one column per item;
    # every other question contributes exactly one, as before.
    per_question_assignment: List[List[Any]] = []

    for i, q_text in enumerate(questions):
        opts_data = results.get(q_text) or []

        item_blocks = _grid_item_blocks(item_results.get(q_text))
        if item_blocks:
            # Grid / scale-matrix question: each statement, attribute or entity
            # becomes its own column holding its own respondent answer, drawn
            # from the question's response scale.
            items = [str(b.get("item", "")) for b in item_blocks]
            headers, text_cells = _grid_columns_for_question(i + 1, q_text.strip(), items)
            col_labels.extend(headers)
            question_text_row_cells.extend(text_cells)
            per_question_assignment.extend(
                _assign_grid_item_responses(rng, item_blocks, total_respondents)
            )
            continue

        col_labels.append(_short_label(q_text, i))
        question_text_row_cells.append(q_text.strip())

        verbatim_pool = _verbatim_pool(opts_data)
        if verbatim_pool:
            # Open-ended question: no aggregate count to reconcile against, just a
            # representative quote pool. Assign each respondent one quote (with
            # replacement, since the pool is far smaller than the respondent count).
            per_question_assignment.append(
                [rng.choice(verbatim_pool) for _ in range(total_respondents)]
            )
            continue

        if isinstance(opts_data, list):
            opts = [str(d.get("option", "")) for d in opts_data if isinstance(d, dict)]
            counts = [max(int(d.get("count", 0) or 0), 0) for d in opts_data if isinstance(d, dict)]
        else:
            opts, counts = [], []

        is_multi = _is_multi_select_type(_lookup_question_type(question_types, q_text))

        if not opts or total_respondents == 0:
            per_question_assignment.append([([] if is_multi else "") for _ in range(total_respondents)])
        elif is_multi:
            per_question_assignment.append(_exact_multi_select_assignment(rng, opts, counts, total_respondents))
        else:
            per_question_assignment.append(_exact_single_select_assignment(rng, opts, counts, total_respondents))

    headers = ["Respondent_ID", "Persona_Type", "Persona_Sample_Size"] + col_labels
    # Short column labels are truncated to a few words for readability; the full
    # question text is never dropped — it's surfaced in a dedicated row right
    # below the header so it's visible without cross-referencing the other CSV.
    question_text_row = ["", "", ""] + question_text_row_cells

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerow(question_text_row)

    respondent_idx = 0
    for persona_idx, (persona_id, sample_size) in enumerate(persona_sample_sizes.items(), 1):
        persona_name = persona_names_map.get(persona_id, f"Persona_{persona_idx}")

        for respondent_num in range(1, sample_size + 1):
            row: List[Any] = [
                f"P{persona_idx}_{respondent_num:04d}",
                persona_name,
                sample_size,
            ]
            for q_assignment in per_question_assignment:
                value = q_assignment[respondent_idx] if respondent_idx < len(q_assignment) else ""
                row.append("; ".join(value) if isinstance(value, list) else value)
            writer.writerow(row)
            respondent_idx += 1

    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def build_quant_transcripts_zip(
    questionnaire_csv: bytes,
    survey_results_csv: bytes,
) -> bytes:
    """
    Package the two quant transcript CSVs into a single ZIP archive.

    Archive layout:
    quant_transcripts/
      questionnaire_overview.csv   ← Q No., Question Description, Options, Count
      survey_results.csv           ← One row per respondent (wide format)
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("quant_transcripts/questionnaire_overview.csv", questionnaire_csv)
        zf.writestr("quant_transcripts/survey_results.csv", survey_results_csv)
    buf.seek(0)
    return buf.read()
