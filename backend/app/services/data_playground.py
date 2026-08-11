"""Data Playground dataset ingestion and DataFrame access.

Upload pipeline (V1):
  1. Router saves the file via file_utils.save_dataset_file (uploads/data_playground/)
  2. ingest_dataset() parses it with pandas, infers variable types, assigns
     stable value codes, and persists dp_dataset + dp_variable rows.

The stored file is the row-level source of truth. Analyses must obtain rows
exclusively through dataframe_for_dataset() — it re-reads the file with the
exact sheet/header resolved at ingest (persisted in dataset.meta), behind a
small LRU cache. Keeping this single access point means a later switch to
row storage in Postgres (sync_survey.response-style) only touches this module.

Sheet classification / header scoring are simplified adaptations of the
heuristics in services/syncdb_survey.py; the type-inference threshold (30
unique values => open text) matches that module's _OPEN_TEXT_THRESHOLD.
"""

import logging
from datetime import datetime
from functools import lru_cache
from typing import Any, Optional

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_playground import DataPlaygroundDataset, DataPlaygroundVariable
from app.utils.file_utils import dataset_file_path, save_dataset_bytes

logger = logging.getLogger(__name__)

_DEMOGRAPHIC_KEYWORDS = {
    "age", "gender", "sex", "location", "country", "state", "city",
    "education", "income", "occupation", "marital", "ethnicity",
    "race", "region", "district", "language", "nationality",
}
_IDENTIFIER_NAME_HINTS = {
    "respid", "resp_id", "respondentid", "respondent_id", "record",
    "recordid", "record_id", "uuid", "id", "caseid", "case_id", "sys_respnum",
}
_OPEN_TEXT_THRESHOLD = 30
_MAX_VALUE_LABELS = 100
_HEADER_SCAN_LIMIT = 10
_NUMERIC_RATIO_THRESHOLD = 0.95


# ── Parsing ──────────────────────────────────────────────────────────────────

def _is_number(value: str) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def _is_int_like(value: str) -> bool:
    return value.lstrip("-").isdigit()


def _cell(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def _detect_header_row(raw: pd.DataFrame) -> int:
    """Pick the most header-looking row among the first few: wide, unique,
    non-numeric, short labels. Earlier rows win ties (headers come first)."""
    best_row, best_score = 0, float("-inf")
    for i in range(min(_HEADER_SCAN_LIMIT, len(raw))):
        values = [_cell(v) for v in raw.iloc[i].tolist()]
        non_empty = [v for v in values if v]
        if len(non_empty) < 2:
            continue
        unique_ratio = len({v.lower() for v in non_empty}) / len(non_empty)
        numeric_ratio = sum(_is_number(v) for v in non_empty) / len(non_empty)
        avg_len = sum(len(v) for v in non_empty) / len(non_empty)
        score = len(non_empty) * 4 + unique_ratio * 8 - numeric_ratio * 10 - i * 0.5
        if avg_len > 40:
            score -= 8
        if score > best_score:
            best_row, best_score = i, score
    return best_row


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Same normalization as syncdb_survey: fill blank/Unnamed headers and
    dedupe repeats so every variable_name is unique and non-empty."""
    columns: list[str] = []
    used: dict[str, int] = {}
    for index, column in enumerate(df.columns, start=1):
        name = _cell(column)
        if not name or name.lower().startswith("unnamed:"):
            name = f"column_{index}"
        suffix = used.get(name, 0)
        used[name] = suffix + 1
        if suffix:
            name = f"{name}_{suffix + 1}"
        columns.append(name)
    normalized = df.copy()
    normalized.columns = columns
    return normalized


def _frame_from_raw(raw: pd.DataFrame, header_row: int) -> pd.DataFrame:
    headers = raw.iloc[header_row]
    df = raw.iloc[header_row + 1:].reset_index(drop=True)
    df.columns = headers
    df = df.dropna(how="all").dropna(axis=1, how="all")
    if df.empty or len(df.columns) == 0:
        raise ValueError("No tabular data found in file")
    return _normalize_columns(df)


def _read_csv_raw(path) -> pd.DataFrame:
    try:
        return pd.read_csv(path, header=None, encoding="utf-8-sig", dtype=object)
    except UnicodeDecodeError:
        return pd.read_csv(path, header=None, encoding="latin-1", dtype=object)


def _pick_excel_sheet(sheets: dict[str, pd.DataFrame]) -> str:
    """Choose the sheet with the most non-empty cells — datamap/metadata
    sheets are narrow, response data sheets dominate on cell count."""
    return max(sheets, key=lambda name: int(sheets[name].notna().sum().sum()))


def _read_dataframe(
    stored_filename: str,
    file_type: str,
    sheet_name: Optional[str] = None,
    header_row: Optional[int] = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Parse the stored file. Returns (df, parse_meta) where parse_meta holds
    the RESOLVED sheet/header so a later re-read is deterministic."""
    path = dataset_file_path(stored_filename)
    if not path.exists():
        raise FileNotFoundError(f"Dataset file missing on disk: {stored_filename}")

    if file_type == "csv":
        raw = _read_csv_raw(path)
        resolved_sheet = None
    else:
        sheets = pd.read_excel(path, sheet_name=None, header=None, dtype=object)
        if not sheets:
            raise ValueError("Workbook contains no sheets")
        if sheet_name is not None:
            if sheet_name not in sheets:
                raise ValueError(
                    f"Sheet '{sheet_name}' not found. Available sheets: {list(sheets)}"
                )
            resolved_sheet = sheet_name
        else:
            resolved_sheet = _pick_excel_sheet(sheets)
        raw = sheets[resolved_sheet]

    raw = raw.dropna(how="all").dropna(axis=1, how="all").reset_index(drop=True)
    if raw.empty:
        raise ValueError("No tabular data found in file")

    resolved_header = header_row if header_row is not None else _detect_header_row(raw)
    df = _frame_from_raw(raw, resolved_header)

    parse_meta = {
        "source": "upload",
        "sheet_name": resolved_sheet,
        "header_row": int(resolved_header),
    }
    return df, parse_meta


# ── Variable discovery ───────────────────────────────────────────────────────

def _sort_labels(labels: list[str]) -> list[str]:
    if labels and all(_is_number(v) for v in labels):
        return sorted(labels, key=float)
    return sorted(labels)


def _build_value_labels(labels: list[str]) -> list[dict[str, Any]]:
    """Stable code↔label map. Integer-looking labels keep their own value as
    the code (preserves survey precodes); anything else gets ordinals 1..N."""
    ordered = _sort_labels(labels)
    if ordered and all(v.lstrip("-").isdigit() for v in ordered):
        return [{"code": int(v), "label": v} for v in ordered]
    return [{"code": i, "label": v} for i, v in enumerate(ordered, start=1)]


def _infer_variable(name: str, series: pd.Series, total_rows: int, position: int) -> dict[str, Any]:
    values = series.dropna().astype(str).str.strip()
    values = values[values != ""]
    non_missing = len(values)
    missing = total_rows - non_missing
    uniques = values.unique().tolist()
    unique_count = len(uniques)

    numeric_ratio = (
        pd.to_numeric(values, errors="coerce").notna().sum() / non_missing
        if non_missing else 0.0
    )
    int_ratio = values.map(_is_int_like).mean() if non_missing else 0.0
    avg_len = values.str.len().mean() if non_missing else 0.0
    name_key = name.lower().strip().replace(" ", "_")

    # All-unique alone doesn't make an identifier: continuous measures (floats)
    # are also all-unique. IDs are integer-like or short non-numeric tokens.
    all_unique_id_shaped = (
        non_missing > _OPEN_TEXT_THRESHOLD
        and unique_count == non_missing
        and (
            int_ratio >= _NUMERIC_RATIO_THRESHOLD
            or (numeric_ratio < 0.5 and avg_len < 20)
        )
    )
    if name_key in _IDENTIFIER_NAME_HINTS or all_unique_id_shaped:
        data_type = "identifier"
    elif any(keyword in name_key for keyword in _DEMOGRAPHIC_KEYWORDS):
        data_type = "demographic"
    elif numeric_ratio >= _NUMERIC_RATIO_THRESHOLD and unique_count > _OPEN_TEXT_THRESHOLD:
        data_type = "numeric"
    elif unique_count > _OPEN_TEXT_THRESHOLD:
        data_type = "open_text"
    else:
        data_type = "categorical"

    value_labels = None
    if data_type in {"categorical", "demographic"} and 0 < unique_count <= _MAX_VALUE_LABELS:
        value_labels = _build_value_labels(uniques)

    return {
        "variable_name": name,
        "display_name": name,  # question text mapping (datamap sheets) is post-V1
        "data_type": data_type,
        "position": position,
        "unique_values_count": unique_count,
        "missing_count": missing,
        "value_labels": value_labels,
    }


def discover_variables(df: pd.DataFrame) -> list[dict[str, Any]]:
    total_rows = len(df)
    return [
        _infer_variable(str(column), df[column], total_rows, position)
        for position, column in enumerate(df.columns)
    ]


# ── Ingestion ────────────────────────────────────────────────────────────────

async def ingest_dataset(
    db: AsyncSession,
    *,
    stored_filename: str,
    original_filename: str,
    file_type: str,
    workspace_id: str,
    exploration_id: str,
    user_id: str,
    name: Optional[str] = None,
    sheet_name: Optional[str] = None,
    header_row: Optional[int] = None,
) -> tuple[DataPlaygroundDataset, list[DataPlaygroundVariable]]:
    """Parse an already-saved upload and persist the dataset + its variables.

    On any parse/persist failure the stored file is removed so failed uploads
    never leave orphans on disk.
    """
    try:
        df, parse_meta = _read_dataframe(stored_filename, file_type, sheet_name, header_row)
        variable_specs = discover_variables(df)

        dataset = DataPlaygroundDataset(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            name=name or original_filename,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_type=file_type,
            row_count=len(df),
            column_count=len(df.columns),
            status="ready",
            meta=parse_meta,
            created_by=user_id,
        )
        variables = [
            DataPlaygroundVariable(dataset_id=dataset.id, **spec)
            for spec in variable_specs
        ]

        db.add(dataset)
        db.add_all(variables)
        await db.commit()
        await db.refresh(dataset)
    except Exception:
        dataset_file_path(stored_filename).unlink(missing_ok=True)
        raise

    logger.info(
        "Data Playground dataset ingested | dataset_id=%s | rows=%d | cols=%d | file=%s",
        dataset.id, dataset.row_count, dataset.column_count, original_filename,
    )
    return dataset, variables


async def ingest_dataset_from_survey_results(
    db: AsyncSession,
    *,
    simulation_id: str,
    workspace_id: str,
    exploration_id: str,
    user_id: str,
) -> tuple[DataPlaygroundDataset, list[DataPlaygroundVariable]]:
    """Auto-imports a dataset from an already-computed SurveySimulation's
    results — the same per-respondent data the "Download Transcripts" ZIP's
    survey_results.csv contains (built via the same
    build_survey_results_csv_bytes helper), so Data Playground and that
    download can never disagree.

    Idempotent per (exploration_id, simulation_id): this runs automatically
    every time the Data Playground modal opens, so a dataset already
    imported from this simulation is reused rather than re-ingested.

    survey_results.csv has an unusual 3-row header (columns, then full
    question text, then data) that the standard single-header-row parser
    doesn't understand. Rather than teach that shared parser a one-off
    format, this normalizes once here: parse the raw CSV with the question
    row treated as data, capture it as display names, drop it, and persist
    a plain single-header CSV — every later read goes through the exact
    same dataframe_for_dataset() path as an uploaded file, unmodified.
    """
    existing = next(
        (
            d for d in await list_datasets(db, workspace_id=workspace_id, exploration_id=exploration_id)
            if (d.meta or {}).get("simulation_id") == simulation_id
        ),
        None,
    )
    if existing:
        return existing, await list_variables(db, dataset_id=existing.id)

    from app.services.persona import get_persona
    from app.services.survey_simulation import (
        get_survey_simulation_by_id,
        get_survey_simulation_by_source_id,
        parse_survey_results_field,
    )
    from app.utils.questionnaire_csv import build_survey_results_csv_bytes

    sim = await get_survey_simulation_by_id(simulation_id)
    if not (sim and sim.workspace_id == workspace_id and sim.exploration_id == exploration_id):
        # Callers may pass the population simulation id instead.
        sim = await get_survey_simulation_by_source_id(simulation_id)
    if not (sim and sim.workspace_id == workspace_id and sim.exploration_id == exploration_id):
        raise ValueError("Survey simulation not found")

    results_data = parse_survey_results_field(sim.results) or {}
    if not results_data:
        raise ValueError("Survey simulation has no results yet")

    persona_ids = sim.persona_id if isinstance(sim.persona_id, list) else ([sim.persona_id] if sim.persona_id else [])
    persona_names_map: dict[str, str] = {}
    for pid in persona_ids:
        persona = await get_persona(pid)
        if persona:
            persona_names_map[pid] = persona.get("name") or persona.get("persona_name") or pid

    # Grid/scale questions expand into one column per item, and multi-select
    # questions need their type to assign several options per respondent —
    # both require the questionnaire schema, not just the aggregate results.
    question_types: dict[str, str] = {}
    item_results: dict = {}
    stored_canonical = sim.normalized_results if isinstance(sim.normalized_results, dict) else {}
    if isinstance(stored_canonical.get("item_results"), dict):
        item_results = stored_canonical["item_results"]

    if sim.simulation_source_id:
        from app.services.questionnaire import get_questionnaire_by_simulation

        questionnaires = await get_questionnaire_by_simulation(
            workspace_id, exploration_id, sim.simulation_source_id
        )
        flat_questions = [q for sec in (questionnaires or []) for q in (sec.get("questions") or [])]
        for q in flat_questions:
            qtext = (q.get("text") or "").strip()
            if qtext:
                question_types[qtext] = q.get("question_type") or "single_select"
        if not item_results and flat_questions:
            from app.utils.survey_results_normalize import build_item_level_results

            item_results = build_item_level_results(
                [
                    {"text": (q.get("text") or "").strip(),
                     "options": results_data.get((q.get("text") or "").strip()) or []}
                    for q in flat_questions
                ],
                flat_questions,
                int(sim.total_sample_size or 0),
            )

    raw_csv_bytes = build_survey_results_csv_bytes(
        results=results_data,
        persona_sample_sizes=sim.persona_sample_sizes or {},
        persona_names_map=persona_names_map,
        seed=sim.id,
        question_types=question_types,
        item_results=item_results,
    )
    if not raw_csv_bytes:
        raise ValueError("Survey simulation has no respondent data to import")

    # Parse the raw (3-row-header) CSV via a throwaway stored file, using
    # the shared reader so header/column normalization stays consistent
    # with every other ingestion path.
    raw_stored_filename, _ = await save_dataset_bytes(raw_csv_bytes, ".csv")
    try:
        df, _parse_meta = _read_dataframe(raw_stored_filename, "csv", sheet_name=None, header_row=0)
    finally:
        dataset_file_path(raw_stored_filename).unlink(missing_ok=True)

    if df.empty:
        raise ValueError("Survey simulation produced no respondent rows")

    question_titles = {column: _cell(df.iloc[0][column]) for column in df.columns}
    df = df.iloc[1:].reset_index(drop=True)

    # Drop any column that is entirely blank, matching the
    # dropna(axis=1, how="all") the shared reader applies on every later read
    # -- otherwise such a column would survive into dp_variable only to
    # silently vanish (KeyError) the next time anything re-reads the file.
    # Open-ended questions used to land here always-blank (no discrete options
    # for the per-respondent sampler to draw from); they now carry their
    # simulated verbatims, so this is a genuine safety net rather than the
    # routine fate of every free-text question.
    df = df.dropna(axis=1, how="all")

    stored_filename, _size = await save_dataset_bytes(df.to_csv(index=False).encode("utf-8"), ".csv")

    try:
        variable_specs = discover_variables(df)
        for spec in variable_specs:
            title = question_titles.get(spec["variable_name"])
            if title:
                spec["display_name"] = title

        dataset = DataPlaygroundDataset(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            name=f"Survey Results — {sim.id}",
            original_filename="survey_results.csv",
            stored_filename=stored_filename,
            file_type="csv",
            row_count=len(df),
            column_count=len(df.columns),
            status="ready",
            meta={"source": "survey_results", "simulation_id": sim.id, "sheet_name": None, "header_row": 0},
            created_by=user_id,
        )
        variables = [
            DataPlaygroundVariable(dataset_id=dataset.id, **spec)
            for spec in variable_specs
        ]

        db.add(dataset)
        db.add_all(variables)
        await db.commit()
        await db.refresh(dataset)
    except Exception:
        dataset_file_path(stored_filename).unlink(missing_ok=True)
        raise

    logger.info(
        "Data Playground dataset imported from survey results | dataset_id=%s | simulation_id=%s | rows=%d | cols=%d",
        dataset.id, sim.id, dataset.row_count, dataset.column_count,
    )
    return dataset, variables


# ── Queries ──────────────────────────────────────────────────────────────────

async def list_datasets(
    db: AsyncSession, *, workspace_id: str, exploration_id: str
) -> list[DataPlaygroundDataset]:
    result = await db.execute(
        select(DataPlaygroundDataset)
        .where(
            DataPlaygroundDataset.workspace_id == workspace_id,
            DataPlaygroundDataset.exploration_id == exploration_id,
        )
        .order_by(DataPlaygroundDataset.created_at.desc())
    )
    return list(result.scalars().all())


async def get_dataset(
    db: AsyncSession, *, dataset_id: str, workspace_id: str, exploration_id: str
) -> Optional[DataPlaygroundDataset]:
    """Scoped lookup — a dataset_id alone is never enough; it must also belong
    to the workspace/exploration in the URL, so a member of one exploration
    can't reach another exploration's dataset by guessing an id."""
    result = await db.execute(
        select(DataPlaygroundDataset).where(
            DataPlaygroundDataset.id == dataset_id,
            DataPlaygroundDataset.workspace_id == workspace_id,
            DataPlaygroundDataset.exploration_id == exploration_id,
        )
    )
    return result.scalars().first()


async def list_variables(db: AsyncSession, *, dataset_id: str) -> list[DataPlaygroundVariable]:
    result = await db.execute(
        select(DataPlaygroundVariable)
        .where(DataPlaygroundVariable.dataset_id == dataset_id)
        .order_by(DataPlaygroundVariable.position)
    )
    return list(result.scalars().all())


# ── DataFrame access for analyses ────────────────────────────────────────────

@lru_cache(maxsize=16)
def _cached_dataframe(stored_filename: str, file_type: str, sheet_name: Optional[str], header_row: Optional[int]) -> pd.DataFrame:
    df, _ = _read_dataframe(stored_filename, file_type, sheet_name, header_row)
    return df


def dataframe_for_dataset(dataset: DataPlaygroundDataset) -> pd.DataFrame:
    """The single row-level access point for all analyses.

    Re-reads the stored file with the exact sheet/header resolved at ingest.
    Returns a copy so callers can never mutate the cached frame.
    """
    meta = dataset.meta or {}
    df = _cached_dataframe(
        dataset.stored_filename,
        dataset.file_type,
        meta.get("sheet_name"),
        meta.get("header_row"),
    )
    return df.copy()


def touch_dataset(dataset: DataPlaygroundDataset) -> None:
    dataset.updated_at = datetime.utcnow()


# ── Coded / Labelled Data rows ──────────────────────────────────────────────

_ROW_MODES = {"coded", "labelled"}


async def get_dataset_rows(
    db: AsyncSession,
    dataset: DataPlaygroundDataset,
    mode: str,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    """Paginated respondent-level grid backing the Coded Data / Labelled Data
    tabs. Not cached in dp_analysis — this is a raw windowed view over the
    file, not an aggregate computation.

    mode="coded" attaches each categorical cell's stored code alongside its
    label; mode="labelled" returns the label only. The first identifier-type
    variable (if any) becomes each row's `respid`; every other variable is
    a column in `values`. Falls back to a 1-based row number when the
    dataset has no identifier-type column.
    """
    if mode not in _ROW_MODES:
        raise ValueError(f"mode must be one of {sorted(_ROW_MODES)}")

    variables = await list_variables(db, dataset_id=dataset.id)
    df = dataframe_for_dataset(dataset)
    total_rows = len(df)

    id_variable = next((v for v in variables if v.data_type == "identifier"), None)
    value_variables = [v for v in variables if v is not id_variable]

    columns = [
        {"key": v.variable_name, "header": v.display_name, "type": v.data_type}
        for v in variables
    ]
    label_to_code = {
        v.variable_name: {item["label"]: item["code"] for item in (v.value_labels or [])}
        for v in value_variables
    }

    start = (page - 1) * page_size
    page_df = df.iloc[start : start + page_size]

    rows = []
    for offset, (_, record) in enumerate(page_df.iterrows()):
        respid = _cell(record[id_variable.variable_name]) if id_variable else str(start + offset + 1)
        values: dict[str, Any] = {}
        for variable in value_variables:
            raw = _cell(record[variable.variable_name])
            if not raw:
                continue
            code = label_to_code[variable.variable_name].get(raw) if mode == "coded" else None
            values[variable.variable_name] = {"code": code, "label": raw}
        rows.append({"respid": respid, "values": values})

    return {
        "columns": columns,
        "rows": rows,
        "page": page,
        "page_size": page_size,
        "total_rows": total_rows,
    }
