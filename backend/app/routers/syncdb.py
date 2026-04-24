"""
SyncDB API Router

Endpoints:
  Action data (CSV → JSONB records):
    POST   /syncdb/action/upload
    GET    /syncdb/action/datasets
    GET    /syncdb/action/{dataset_id}/records

  Survey data (CSV → normalized JSON + aggregation):
    POST   /syncdb/survey/upload
    GET    /syncdb/survey/datasets
    GET    /syncdb/survey/{dataset_id}/schema
    GET    /syncdb/survey/{dataset_id}/aggregation
    POST   /syncdb/survey/{dataset_id}/link-exploration

  Source bank (PDF/DOCX/TXT → text chunks; CSV/XLSX → per-row JSONB; URL → scraped):
    POST   /syncdb/source/upload
    POST   /syncdb/source/url
    POST   /syncdb/source/{document_id}/process
    GET    /syncdb/source/documents
    GET    /syncdb/source/search
    GET    /syncdb/source/{document_id}/chunks
"""
import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.syncdb import (
    ActionDatasetOut,
    ActionRecordOut,
    ActionRecordsPage,
    LinkExplorationIn,
    SourceDocumentOut,
    SourceScrapeReportOut,
    SourceSearchResult,
    SurveyAggregationOut,
    SurveyDatasetOut,
)
from app.services import syncdb_action, syncdb_source, syncdb_survey, syncdb_scraper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/syncdb", tags=["SyncDB"])

_ALLOWED_TABULAR_EXTENSIONS = {".csv", ".xlsx", ".xls"}
_ALLOWED_SOURCE_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".xlsx", ".xls", ".csv"}


def _parse_form_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value

    normalized = str(value).strip().lower()
    if not normalized:
        return default
    if normalized in {"1", "true", "t", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "f", "no", "n", "off"}:
        return False

    logger.warning("Unrecognized boolean form value | raw=%r | default=%s", value, default)
    return default


async def _background_scrape_urls(
    document_id: str,
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
) -> None:
    """Background task: scrape Source Link URLs found in a tabular source document."""
    from app.db import async_session
    logger.info(
        "Background URL scrape started | doc_id=%s | domain=%s | exploration_id=%s | user_id=%s",
        document_id, domain, exploration_id, user_id,
    )
    async with async_session() as db:
        try:
            report = await syncdb_scraper.scrape_urls_from_document(
                db=db,
                document_id=document_id,
                domain=domain,
                exploration_id=exploration_id,
                user_id=user_id,
            )
            logger.info(
                "Background URL scrape done | doc_id=%s | succeeded=%d | failed=%d",
                document_id, report.total_succeeded, report.total_failed,
            )
        except Exception:
            logger.exception("Background URL scrape error | doc_id=%s", document_id)
        finally:
            logger.info("Background URL scrape exited | doc_id=%s", document_id)


def _require_tabular(file: UploadFile):
    ext = ("." + (file.filename or "").rsplit(".", 1)[-1]).lower() if "." in (file.filename or "") else ""
    if ext not in _ALLOWED_TABULAR_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Accepted formats: {sorted(_ALLOWED_TABULAR_EXTENSIONS)}",
        )


def _validate_domain(domain: str) -> None:
    """Reject blank / placeholder domain values."""
    if not domain or not domain.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="domain is required and must not be empty",
        )


def _workspace_id(user: User) -> Optional[str]:
    """Resolve workspace/org id from the JWT user."""
    return getattr(user, "organization_id", None) or user.id


# ── Action Data ───────────────────────────────────────────────────────────────

@router.post("/action/upload", response_model=ActionDatasetOut)
async def upload_action_csv(
    file: UploadFile = File(...),
    name: str = Form(...),
    domain: str = Form(...),
    region: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    exploration_id: Optional[str] = Form(None),
    sheet_name: Optional[str] = Form(
        None,
        description="Optional Excel sheet index or tab name. Leave empty to ingest all sheets. Placeholder values like 'string' are ignored.",
    ),
    header_row: Optional[int] = Form(
        None,
        description="Optional 0-based header row. When omitted, the backend auto-detects the header row per sheet.",
    ),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Ingest structured action/event data (CSV or Excel).
    Each row is stored as a separate JSONB record with standard envelope.
    PII identifier fields (accountEmailId, email, userId, etc.) are auto-detected,
    SHA-256 hashed into subject_key, and removed from the stored payload.

    For Excel uploads, callers can still force a sheet/header explicitly.
    When sheet_name is omitted, the backend scans all workbook tabs and combines
    all detected data sheets into one dataset.
    """
    _require_tabular(file)
    _validate_domain(domain)
    file_bytes = await file.read()
    try:
        dataset = await syncdb_action.ingest_action_csv(
            db=db,
            file_bytes=file_bytes,
            filename=file.filename,
            name=name,
            domain=domain.strip(),
            exploration_id=exploration_id,
            user_id=current_user.id,
            workspace_id=_workspace_id(current_user),
            region=region,
            year=year,
            sheet_name=sheet_name,
            header_row=header_row,
        )
    except Exception as exc:
        logger.exception("Action ingest failed")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return dataset


@router.get("/action/datasets", response_model=list[ActionDatasetOut])
async def list_action_datasets(
    exploration_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return await syncdb_action.list_action_datasets(db, exploration_id=exploration_id)


@router.get("/action/{dataset_id}/records", response_model=ActionRecordsPage)
async def get_action_records(
    dataset_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    dataset = await syncdb_action.get_action_dataset(db, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return await syncdb_action.get_action_records(db, dataset_id, page=page, page_size=page_size)


# ── Survey Data ───────────────────────────────────────────────────────────────

@router.post("/survey/upload", response_model=SurveyDatasetOut)
async def upload_survey_csv(
    file: UploadFile = File(...),
    name: str = Form(...),
    domain: str = Form(...),
    region: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    exploration_id: Optional[str] = Form(None),
    sheet_name: Optional[str] = Form(
        None,
        description="Optional Excel sheet index or tab name. Leave empty to ingest all sheets. Placeholder values like 'string' are ignored.",
    ),
    header_row: Optional[int] = Form(
        None,
        description="Optional 0-based header row. When omitted, the backend auto-detects the header row.",
    ),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Ingest survey data (CSV or Excel).
    Auto-detects question columns, options, and demographics.
    Computes aggregated results in SurveySimulation.results format.

    For Excel uploads, callers can still force a sheet/header explicitly.
    When sheet_name is omitted, the backend scans all workbook tabs,
    combines all detected response sheets into one dataset, and preserves
    datamap/metadata sheets inside dataset metadata.
    """
    _require_tabular(file)
    _validate_domain(domain)
    file_bytes = await file.read()
    try:
        dataset = await syncdb_survey.ingest_survey_csv(
            db=db,
            file_bytes=file_bytes,
            filename=file.filename,
            name=name,
            domain=domain.strip(),
            exploration_id=exploration_id,
            user_id=current_user.id,
            workspace_id=_workspace_id(current_user),
            region=region,
            year=year,
            sheet_name=sheet_name,
            header_row=header_row,
        )
    except Exception as exc:
        logger.exception("Survey ingest failed")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return dataset


@router.get("/survey/datasets", response_model=list[SurveyDatasetOut])
async def list_survey_datasets(
    exploration_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return await syncdb_survey.list_survey_datasets(db, exploration_id=exploration_id)


@router.get("/survey/{dataset_id}/schema", response_model=SurveyDatasetOut)
async def get_survey_schema(
    dataset_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    dataset = await syncdb_survey.get_survey_dataset(db, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/survey/{dataset_id}/aggregation", response_model=SurveyAggregationOut)
async def get_survey_aggregation(
    dataset_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    agg = await syncdb_survey.get_survey_aggregation(db, dataset_id)
    if agg is None:
        raise HTTPException(status_code=404, detail="Aggregation not found")
    return agg


@router.post("/survey/{dataset_id}/link-exploration", response_model=SurveyDatasetOut)
async def link_survey_to_exploration(
    dataset_id: str,
    body: LinkExplorationIn,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Associate a survey dataset with an existing exploration for report generation."""
    dataset = await syncdb_survey.get_survey_dataset(db, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return await syncdb_survey.link_exploration(db, dataset_id, body.exploration_id)


# ── Source Bank ───────────────────────────────────────────────────────────────

@router.post("/source/upload", response_model=SourceDocumentOut)
async def upload_source_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    domain: Optional[str] = Form(None),
    exploration_id: Optional[str] = Form(None),
    scrape_urls: Optional[str] = Form(None),
    scrape_sync: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Upload a document to the source bank.

    - PDF / DOCX / TXT: stored as bytea; call POST /source/{id}/process to extract text.
    - CSV / XLSX / XLS: each row saved as individual JSON record immediately.
      Pass scrape_urls=true to auto-scrape any 'Source Link' URLs found in the file
      (runs in the background after the response is returned).
    """
    import os

    ext = os.path.splitext(file.filename or "")[1].lower()
    scrape_run_sync = _parse_form_bool(scrape_sync, default=False)
    scrape_requested = _parse_form_bool(scrape_urls, default=False) or scrape_run_sync

    logger.info(
        "Source upload request | file=%s | ext=%s | scrape_urls_raw=%r | scrape_urls=%s | scrape_sync_raw=%r | scrape_sync=%s | exploration_id=%s | user=%s",
        file.filename,
        ext,
        scrape_urls,
        scrape_requested,
        scrape_sync,
        scrape_run_sync,
        exploration_id,
        current_user.id,
    )

    if ext not in _ALLOWED_SOURCE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {sorted(_ALLOWED_SOURCE_EXTENSIONS)}",
        )
    file_bytes = await file.read()
    try:
        doc = await syncdb_source.upload_source_document(
            db=db,
            file_bytes=file_bytes,
            filename=file.filename,
            title=title,
            domain=domain,
            source_type=ext.lstrip("."),
            exploration_id=exploration_id,
            user_id=current_user.id,
        )
    except Exception as exc:
        logger.exception("Source document upload failed")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # Auto-scrape Source Link URLs from tabular files if requested
    should_scrape = bool(doc) and scrape_requested and ext in (".xlsx", ".xls", ".csv")
    if should_scrape and scrape_run_sync:
        logger.info("Running URL scrape synchronously | doc_id=%s", doc["id"])
        report = await syncdb_scraper.scrape_urls_from_document(
            db=db,
            document_id=doc["id"],
            domain=domain,
            exploration_id=exploration_id,
            user_id=current_user.id,
        )
        logger.info(
            "Synchronous URL scrape done | doc_id=%s | succeeded=%d | failed=%d",
            doc["id"],
            report.total_succeeded,
            report.total_failed,
        )
    elif should_scrape:
        background_tasks.add_task(
            _background_scrape_urls,
            document_id=doc["id"],
            domain=domain,
            exploration_id=exploration_id,
            user_id=current_user.id,
        )
        logger.info(
            "URL scrape background task queued | doc_id=%s | mode=background",
            doc["id"],
        )
    else:
        logger.info(
            "URL scrape not queued | doc_id=%s | scrape_requested=%s | scrape_sync=%s | file_type_supported=%s",
            (doc or {}).get("id"),
            scrape_requested,
            scrape_run_sync,
            ext in (".xlsx", ".xls", ".csv"),
        )

    return doc


@router.post("/source/url", response_model=SourceDocumentOut)
async def register_source_url(
    url: str = Form(...),
    title: str = Form(...),
    domain: Optional[str] = Form(None),
    exploration_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Register a URL-based document (PDF or article). Content can be extracted later."""
    doc = await syncdb_source.register_url_document(
        db=db,
        url=url,
        title=title,
        domain=domain,
        exploration_id=exploration_id,
        user_id=current_user.id,
    )
    return doc


@router.post("/source/{document_id}/process")
async def process_source_document(
    document_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Extract text from a stored document and split into searchable chunks.
    Safe to call multiple times — re-processes and replaces existing chunks.
    """
    try:
        result = await syncdb_source.process_document(db, document_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.exception("Document processing failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    return result


@router.post("/source/{document_id}/scrape", response_model=SourceScrapeReportOut)
async def scrape_source_document_urls(
    document_id: str,
    domain: Optional[str] = Form(None),
    exploration_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Trigger Source Link scraping for an already-uploaded CSV/XLSX document.

    Runs synchronously and returns the scrape summary, which makes it useful
    for debugging the scraping flow without relying on BackgroundTasks.
    """
    doc = await syncdb_source.get_source_document(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc["source_type"].lower() not in {"csv", "xlsx", "xls"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scraping is only supported for CSV/XLSX/XLS source documents",
        )

    logger.info(
        "Manual scrape request | doc_id=%s | domain=%s | exploration_id=%s | user=%s",
        document_id,
        domain,
        exploration_id,
        current_user.id,
    )

    report = await syncdb_scraper.scrape_urls_from_document(
        db=db,
        document_id=document_id,
        domain=domain or doc.get("domain"),
        exploration_id=exploration_id or doc.get("exploration_id"),
        user_id=current_user.id,
    )
    logger.info(
        "Manual scrape finished | doc_id=%s | succeeded=%d | failed=%d",
        document_id, report.total_succeeded, report.total_failed,
    )
    return report.to_dict()


@router.get("/source/documents", response_model=list[SourceDocumentOut])
async def list_source_documents(
    domain: Optional[str] = Query(None),
    exploration_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return await syncdb_source.list_source_documents(db, domain=domain, exploration_id=exploration_id)


@router.get("/source/search", response_model=list[SourceSearchResult])
async def search_source_bank(
    q: str = Query(..., min_length=2),
    domain: Optional[str] = Query(None),
    data_type: Optional[str] = Query(None, description="Filter by chunk data type: tabular, scraped, or document"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Full-text search across all processed source bank chunks."""
    try:
        return await syncdb_source.search_source_chunks(
            db,
            query=q,
            domain=domain,
            limit=limit,
            data_type=data_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/source/{document_id}/chunks")
async def get_source_chunks(
    document_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    data_type: Optional[str] = Query(None, description="Filter by chunk data type: tabular, scraped, or document"),
    order_by: str = Query("chunk_index", description="Order chunks by chunk_index or created_at"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Fetch all text chunks for a processed source document."""
    doc = await syncdb_source.get_source_document(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        return await syncdb_source.get_document_chunks(
            db,
            document_id,
            source_type=doc["source_type"],
            limit=limit,
            offset=offset,
            data_type=data_type,
            order_by=order_by,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
