"""
SyncDB action data service.

Behavior:
- CSV uploads are ingested directly.
- If an Excel sheet is explicitly provided, only that sheet is processed.
- Otherwise, all workbook sheets are inspected and all detected data sheets
  are combined into one dataset.
- Mapping/metadata sheets are preserved in dataset metadata instead of being
  stored as row records.
"""

import hashlib
import io
import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.utils.id_generator import generate_id
from app.utils.syncdb_helpers import parse_json_strings
from app.services.syncdb_survey import _build_workbook_plan, _read_excel_sheet, _read_excel_sheet_raw, _serialize_non_data_sheet


_PII_FIELDS = {
    "accountemailid", "emailid", "email", "email_id",
    "userid", "user_id", "accountid", "account_id",
    "mobilenumber", "mobile", "phone", "phonenumber",
    "customernumber", "customerid", "customer_id",
}
_AUTO_SHEET_TOKENS = {"", "string", "all", "auto", "*", "none", "null", "undefined"}
_SHEET_SCAN_LIMIT = 50
_RECORD_INSERT_BATCH_SIZE = 1000
_DATA_HEADER_HINTS = {
    "id", "uuid", "date", "timestamp", "status", "record", "event",
    "user", "account", "email", "amount", "channel", "source",
}
_MAPPING_NAME_HINTS = {"datamap", "codebook", "schema", "legend", "mapping", "map"}
_METADATA_NAME_HINTS = {"metadata", "summary", "overview", "intro", "cover", "readme", "notes"}


def _normalize_sheet_selector(sheet_name: int | str | None) -> int | str | None:
    if sheet_name is None:
        return None
    if isinstance(sheet_name, int):
        return sheet_name
    value = str(sheet_name).strip()
    if value.lower() in _AUTO_SHEET_TOKENS:
        return None
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    return value


def _stringify_cell(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _looks_like_long_text_row(values: list[str]) -> bool:
    non_empty = [value for value in values if value]
    return bool(non_empty) and len(non_empty) <= 2 and any(len(value) >= 80 for value in non_empty)


def _score_header_candidate(row_values: list[str], following_rows: list[list[str]]) -> float:
    non_empty = [value for value in row_values if value]
    if len(non_empty) < 2:
        return float("-inf")

    unique_ratio = len({value.lower() for value in non_empty}) / len(non_empty)
    numeric_ratio = sum(value.replace(".", "", 1).isdigit() for value in non_empty) / len(non_empty)
    avg_len = sum(len(value) for value in non_empty) / len(non_empty)
    next_row_density = 0.0
    if following_rows:
        next_non_empty = [value for value in following_rows[0] if value]
        next_row_density = len(next_non_empty) / max(len(non_empty), 1)

    header_hits = sum(1 for value in non_empty if value.lower() in _DATA_HEADER_HINTS)

    score = float(len(non_empty) * 4)
    score += unique_ratio * 8
    score += max(0.0, 4 - numeric_ratio * 10)
    score += min(next_row_density, 2.0) * 4
    score += min(header_hits * 2, 10)
    if avg_len > 40:
        score -= 8
    if _looks_like_long_text_row(row_values):
        score -= 12
    return score


def _analyze_sheet(sheet: Any, sheet_index: int) -> dict[str, Any]:
    sampled_rows: list[tuple[int, list[str]]] = []
    for row_number, row in enumerate(sheet.iter_rows(values_only=True), start=1):
        values = [_stringify_cell(cell) for cell in row]
        if any(values):
            sampled_rows.append((row_number, values))
        if len(sampled_rows) >= _SHEET_SCAN_LIMIT:
            break

    max_width = max((sum(1 for value in values if value) for _, values in sampled_rows), default=0)
    best_header_row = 0
    best_header_score = float("-inf")
    long_text_rows = 0

    for idx, (row_number, values) in enumerate(sampled_rows):
        if _looks_like_long_text_row(values):
            long_text_rows += 1
        following_rows = [row for _, row in sampled_rows[idx + 1 : idx + 3]]
        score = _score_header_candidate(values, following_rows)
        if score > best_header_score:
            best_header_score = score
            best_header_row = row_number - 1

    row_extent = sheet.max_row or len(sampled_rows)
    estimated_row_count = max(row_extent - best_header_row - 1, max(len(sampled_rows) - 1, 0))
    return {
        "sheet_name": sheet.title,
        "sheet_index": sheet_index,
        "header_row": max(best_header_row, 0),
        "header_score": round(best_header_score, 2),
        "estimated_row_count": estimated_row_count,
        "sampled_non_empty_rows": len(sampled_rows),
        "sampled_max_width": max_width,
        "long_text_rows": long_text_rows,
    }


def _classify_action_sheet(analysis: dict[str, Any]) -> str:
    title_lower = analysis["sheet_name"].lower().strip()
    max_width = analysis["sampled_max_width"]

    if analysis["sampled_non_empty_rows"] == 0 or max_width == 0:
        return "empty"
    if any(hint in title_lower for hint in _MAPPING_NAME_HINTS):
        return "mapping"
    if any(hint in title_lower for hint in _METADATA_NAME_HINTS):
        return "metadata"
    if max_width <= 2 or analysis["long_text_rows"] >= 2:
        return "metadata"
    if max_width >= 4 and analysis["header_score"] >= 8:
        return "data"
    return "data" if max_width >= 3 else "metadata"


def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    columns: list[str] = []
    used: dict[str, int] = {}
    for index, column in enumerate(df.columns, start=1):
        name = _stringify_cell(column)
        if not name or name.lower().startswith("unnamed:"):
            name = f"column_{index}"
        suffix = used.get(name, 0)
        used[name] = suffix + 1
        if suffix:
            name = f"{name}_{suffix + 1}"
        columns.append(name)

    df = df.copy()
    df.columns = columns
    return df


def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(how="all")
    df = _normalize_dataframe_columns(df)
    df = df.where(pd.notnull(df), None)
    return df


def _align_dataframe_to_schema(df: pd.DataFrame, all_columns: list[str]) -> pd.DataFrame:
    for col in all_columns:
        if col not in df.columns:
            df[col] = None
    return df[all_columns]


def _df_to_records(df: pd.DataFrame) -> list[dict]:
    return [{col: row[col] for col in df.columns} for _, row in df.iterrows()]


def _detect_pii_fields(columns: list[str]) -> list[str]:
    return [col for col in columns if col.lower() in _PII_FIELDS]


def _build_record_payload(row: dict, pii_fields: list[str]) -> tuple[Optional[str], dict]:
    payload = dict(row)
    subject_key = None
    for field in pii_fields:
        if field in payload and payload[field] is not None:
            raw = str(payload.pop(field))
            subject_key = hashlib.sha256(raw.encode()).hexdigest()
    payload = parse_json_strings(payload)
    return subject_key, payload


async def _insert_record_batch(db: AsyncSession, batch: list[dict]) -> None:
    if batch:
        await db.execute(
            text(
                """
                INSERT INTO sync_action.record
                    (id, dataset_id, row_index, data,
                     status, workspace_id, region, year, source_format, subject_key)
                VALUES
                    (:id, :dataset_id, :row_index, CAST(:data AS jsonb),
                     :status, :workspace_id, :region, :year, :source_format, :subject_key)
                """
            ),
            batch,
        )


async def ingest_action_csv(
    db: AsyncSession,
    file_bytes: bytes,
    filename: str,
    name: str,
    domain: str,
    exploration_id: Optional[str],
    user_id: str,
    workspace_id: Optional[str],
    region: Optional[str],
    year: Optional[int],
    sheet_name: int | str | None = None,
    header_row: Optional[int] = None,
) -> dict:
    """
    Parse a CSV/Excel file and store action rows as JSONB records with a standard envelope.
    """
    ext = ("." + filename.rsplit(".", 1)[-1]).lower() if "." in filename else ""
    source_format = "excel" if ext in (".xlsx", ".xls") else "csv"
    dataset_id = generate_id()
    ingested_at = datetime.now(timezone.utc).isoformat()

    if source_format == "csv":
        df = _clean_dataframe(pd.read_csv(io.BytesIO(file_bytes), header=header_row if header_row is not None else 0))
        if df.empty or len(df.columns) == 0:
            raise ValueError("No tabular action data found after removing empty rows and columns")

        rows_as_dicts: list[dict] = json.loads(df.to_json(orient="records"))
        columns = list(df.columns)
        pii_field = _detect_pii_fields(columns)
        dataset_metadata = {
            "selection_mode": "csv",
            "requested_sheet": None,
            "processed_sheets": [],
            "data_sheets": [],
            "mapping_sheets": [],
            "metadata_sheets": [],
            "header_row": header_row if header_row is not None else 0,
            "column_count": len(columns),
        }

        await db.execute(
            text(
                """
                INSERT INTO sync_action.dataset
                    (id, name, domain, source_file, row_count, columns,
                     exploration_id, uploaded_by, metadata)
                VALUES
                    (:id, :name, :domain, :source_file, :row_count,
                     CAST(:columns AS jsonb), :exploration_id, :uploaded_by,
                     CAST(:metadata AS jsonb))
                """
            ),
            {
                "id": dataset_id,
                "name": name,
                "domain": domain,
                "source_file": filename,
                "row_count": len(rows_as_dicts),
                "columns": json.dumps(columns),
                "exploration_id": exploration_id,
                "uploaded_by": user_id,
                "metadata": json.dumps(dataset_metadata),
            },
        )

        batch: list[dict] = []
        for index, row in enumerate(rows_as_dicts):
            subject_key, payload = _build_record_payload(row, pii_field)
            envelope = {
                "source_type": "actions",
                "domain": domain,
                "workspace_id": workspace_id,
                "region": region,
                "year": year,
                "source_file": filename,
                "source_format": source_format,
                "ingested_at": ingested_at,
                "status": "pending",
                "payload": payload,
            }
            batch.append(
                {
                    "id": generate_id(),
                    "dataset_id": dataset_id,
                    "row_index": index,
                    "data": json.dumps(envelope),
                    "status": "pending",
                    "workspace_id": workspace_id,
                    "region": region,
                    "year": year,
                    "source_format": source_format,
                    "subject_key": subject_key,
                }
            )
            if len(batch) >= _RECORD_INSERT_BATCH_SIZE:
                await _insert_record_batch(db, batch)
                batch = []

        await _insert_record_batch(db, batch)
        await db.commit()
        return await get_action_dataset(db, dataset_id)

    workbook_plans, selection_metadata =_build_workbook_plan(
        file_bytes=file_bytes,
        explicit_sheet_name=sheet_name,
        explicit_header_row=header_row,
    )

    dataset_metadata = {
        **selection_metadata,
        "processed_sheets": [],
        "data_sheets": [],
        "mapping_sheets": [],
        "metadata_sheets": [],
    }
    dataset_columns: list[str] = []
    seen_columns: set[str] = set()
    row_count = 0
    row_index = 0
    batch: list[dict] = []
    has_data_sheet = False

    for plan in workbook_plans:
        plan_summary = {
            "sheet_name": plan["sheet_name"],
            "sheet_index": plan["sheet_index"],
            "classification": plan["classification"],
            "ingest_role": plan["ingest_role"],
            "header_row": plan["header_row"],
            "header_score": plan["header_score"],
            "sampled_max_width": plan["sampled_max_width"],
            "estimated_row_count": plan["estimated_row_count"],
        }

        if plan["ingest_role"] == "data":
            df = _clean_dataframe(_read_excel_sheet(file_bytes, plan["sheet_name"], plan["header_row"]))
            if df.empty or len(df.columns) == 0:
                plan_summary["status"] = "skipped_empty_after_parse"
                dataset_metadata["processed_sheets"].append(plan_summary)
                continue

            has_data_sheet = True
            plan_summary["status"] = "processed"
            plan_summary["row_count"] = int(len(df))
            plan_summary["column_count"] = int(len(df.columns))
            dataset_metadata["processed_sheets"].append(plan_summary)
            dataset_metadata["data_sheets"].append(plan_summary.copy())

            for column in df.columns:
                if column not in seen_columns:
                    seen_columns.add(column)
                    dataset_columns.append(column)

            rows_as_dicts: list[dict] = json.loads(df.to_json(orient="records"))
            pii_field = _detect_pii_fields(list(df.columns))
            for row in rows_as_dicts:
                subject_key, payload = _build_record_payload(row, pii_field)
                envelope = {
                    "source_type": "actions",
                    "domain": domain,
                    "workspace_id": workspace_id,
                    "region": region,
                    "year": year,
                    "source_file": filename,
                    "source_format": source_format,
                    "source_sheet": plan["sheet_name"],
                    "ingested_at": ingested_at,
                    "status": "pending",
                    "payload": payload,
                }
                batch.append(
                    {
                        "id": generate_id(),
                        "dataset_id": dataset_id,
                        "row_index": row_index,
                        "data": json.dumps(envelope),
                        "status": "pending",
                        "workspace_id": workspace_id,
                        "region": region,
                        "year": year,
                        "source_format": source_format,
                        "subject_key": subject_key,
                    }
                )
                row_index += 1
                row_count += 1
                if len(batch) >= _RECORD_INSERT_BATCH_SIZE:
                    await _insert_record_batch(db, batch)
                    batch = []
            continue

        raw_df = _read_excel_sheet_raw(file_bytes, plan["sheet_name"])
        raw_rows = _serialize_non_data_sheet(raw_df)
        if not raw_rows:
            plan_summary["status"] = "skipped_empty_after_parse"
            dataset_metadata["processed_sheets"].append(plan_summary)
            continue

        plan_summary["status"] = "processed"
        plan_summary["row_count"] = len(raw_rows)
        plan_summary["column_count"] = max((len(row) for row in raw_rows), default=0)
        dataset_metadata["processed_sheets"].append(plan_summary)
        payload = {
            "sheet_name": plan["sheet_name"],
            "sheet_index": plan["sheet_index"],
            "classification": plan["classification"],
            "header_row": plan["header_row"],
            "rows": raw_rows,
        }
        if plan["ingest_role"] == "mapping":
            dataset_metadata["mapping_sheets"].append(payload)
        else:
            dataset_metadata["metadata_sheets"].append(payload)

    if not has_data_sheet or row_count == 0:
        raise ValueError("No action data sheets were found in the workbook")

    dataset_metadata["column_count"] = len(dataset_columns)
    dataset_metadata["row_count"] = row_count

    await db.execute(
        text(
            """
            INSERT INTO sync_action.dataset
                (id, name, domain, source_file, row_count, columns,
                 exploration_id, uploaded_by, metadata)
            VALUES
                (:id, :name, :domain, :source_file, :row_count,
                 CAST(:columns AS jsonb), :exploration_id, :uploaded_by,
                 CAST(:metadata AS jsonb))
            """
        ),
        {
            "id": dataset_id,
            "name": name,
            "domain": domain,
            "source_file": filename,
            "row_count": row_count,
            "columns": json.dumps(dataset_columns),
            "exploration_id": exploration_id,
            "uploaded_by": user_id,
            "metadata": json.dumps(dataset_metadata),
        },
    )

    await _insert_record_batch(db, batch)
    await db.commit()
    return await get_action_dataset(db, dataset_id)


async def get_action_dataset(db: AsyncSession, dataset_id: str) -> Optional[dict]:
    row = await db.execute(
        text("SELECT * FROM sync_action.dataset WHERE id = :id"),
        {"id": dataset_id},
    )
    result = row.mappings().first()
    return dict(result) if result else None


async def list_action_datasets(
    db: AsyncSession,
    exploration_id: Optional[str] = None,
) -> list[dict]:
    if exploration_id:
        rows = await db.execute(
            text("SELECT * FROM sync_action.dataset WHERE exploration_id = :eid ORDER BY uploaded_at DESC"),
            {"eid": exploration_id},
        )
    else:
        rows = await db.execute(text("SELECT * FROM sync_action.dataset ORDER BY uploaded_at DESC"))
    return [dict(r) for r in rows.mappings().all()]


async def get_action_records(
    db: AsyncSession,
    dataset_id: str,
    page: int = 1,
    page_size: int = 100,
) -> dict:
    offset = (page - 1) * page_size

    total_row = await db.execute(
        text("SELECT COUNT(*) FROM sync_action.record WHERE dataset_id = :did"),
        {"did": dataset_id},
    )
    total = total_row.scalar()

    rows = await db.execute(
        text(
            """
            SELECT * FROM sync_action.record
            WHERE dataset_id = :did
            ORDER BY row_index
            LIMIT :lim OFFSET :off
            """
        ),
        {"did": dataset_id, "lim": page_size, "off": offset},
    )
    items = [dict(r) for r in rows.mappings().all()]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }
