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

  Source bank (PDF/DOCX/TXT/XLSX → text chunks):
    POST   /syncdb/source/upload
    POST   /syncdb/source/url
    POST   /syncdb/source/{document_id}/process
    GET    /syncdb/source/documents
    GET    /syncdb/source/search
    GET    /syncdb/source/{document_id}/chunks
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
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
    SourceSearchResult,
    SurveyAggregationOut,
    SurveyDatasetOut,
)
from app.services import syncdb_action, syncdb_source, syncdb_survey

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/syncdb", tags=["SyncDB"])

_ALLOWED_TABULAR_EXTENSIONS = {".csv", ".xlsx", ".xls"}
_ALLOWED_SOURCE_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".xlsx"}


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
    file: UploadFile = File(...),
    title: str = Form(...),
    domain: Optional[str] = Form(None),
    exploration_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Upload a PDF, DOCX, or TXT document to the source bank."""
    import os

    ext = os.path.splitext(file.filename or "")[1].lower()
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
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Full-text search across all processed source bank chunks."""
    return await syncdb_source.search_source_chunks(db, query=q, domain=domain, limit=limit)


@router.get("/source/{document_id}/chunks")
async def get_source_chunks(
    document_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Fetch all text chunks for a processed source document."""
    doc = await syncdb_source.get_source_document(db, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return await syncdb_source.get_document_chunks(db, document_id, source_type=doc["source_type"], limit=limit, offset=offset)
