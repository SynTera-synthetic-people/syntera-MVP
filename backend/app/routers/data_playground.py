"""
Data Playground API Router

Endpoints (V1 — upload + variable discovery; frequency/crosstab/chart/insights
land in later phases):
  POST  /workspaces/{workspace_id}/explorations/{exploration_id}/data-playground/datasets
  GET   /workspaces/{workspace_id}/explorations/{exploration_id}/data-playground/datasets
  GET   /workspaces/{workspace_id}/explorations/{exploration_id}/data-playground/datasets/{dataset_id}/variables
"""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.data_playground import (
    ChartRequest,
    ChartResponseOut,
    CrosstabRequest,
    CrosstabResponseOut,
    DatasetOut,
    DatasetRowsPageOut,
    DatasetUploadOut,
    FrequencyRequest,
    FrequencyResponseOut,
    InsightsResponseOut,
    VariableOut,
    VariablesListOut,
)
from app.schemas.response import SuccessResponse
from app.services import data_playground as dp_service
from app.services import data_playground_analysis as dp_analysis
from app.services import workspace as ws_service
from app.services.exploration import get_exploration
from app.utils.file_utils import DATASET_ALLOWED_EXT, save_dataset_file

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/data-playground",
    tags=["Data Playground"],
)


async def _require_workspace_member(workspace_id: str, current_user: User) -> None:
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Not a workspace member")


async def _require_exploration(session: AsyncSession, workspace_id: str, exploration_id: str):
    exploration = await get_exploration(session, exploration_id)
    if not exploration or exploration.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Exploration not found")
    return exploration


async def _require_dataset(
    db: AsyncSession, *, dataset_id: str, workspace_id: str, exploration_id: str
):
    dataset = await dp_service.get_dataset(
        db, dataset_id=dataset_id, workspace_id=workspace_id, exploration_id=exploration_id
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


def _dataset_out(dataset, cls=DatasetOut) -> DatasetOut:
    return cls(
        dataset_id=dataset.id,
        name=dataset.name,
        original_filename=dataset.original_filename,
        file_type=dataset.file_type,
        status=dataset.status,
        rows=dataset.row_count,
        columns=dataset.column_count,
        created_at=dataset.created_at,
    )


@router.post("/datasets", response_model=SuccessResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    workspace_id: str,
    exploration_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Upload a CSV/XLSX dataset, parse it, and persist its variable schema."""
    await _require_workspace_member(workspace_id, current_user)
    await _require_exploration(db, workspace_id, exploration_id)

    ext = ("." + file.filename.rsplit(".", 1)[-1]).lower() if file.filename and "." in file.filename else ""
    if ext not in DATASET_ALLOWED_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Accepted formats: {sorted(DATASET_ALLOWED_EXT)}",
        )

    try:
        stored_name, _size, _ctype, ext = await save_dataset_file(file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    try:
        dataset, variables = await dp_service.ingest_dataset(
            db,
            stored_filename=stored_name,
            original_filename=file.filename,
            file_type=ext.lstrip("."),
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            user_id=current_user.id,
        )
    except Exception as exc:
        logger.exception("Data Playground dataset ingest failed | exploration_id=%s", exploration_id)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    payload = _dataset_out(dataset, DatasetUploadOut)
    payload.variables = [VariableOut.model_validate(v) for v in variables]
    return SuccessResponse(message="Dataset uploaded", data=payload)


@router.get("/datasets", response_model=SuccessResponse)
async def list_datasets(
    workspace_id: str,
    exploration_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    await _require_workspace_member(workspace_id, current_user)
    await _require_exploration(db, workspace_id, exploration_id)

    datasets = await dp_service.list_datasets(
        db, workspace_id=workspace_id, exploration_id=exploration_id
    )
    return SuccessResponse(
        message="Datasets fetched",
        data=[_dataset_out(d) for d in datasets],
    )


@router.get("/datasets/{dataset_id}/variables", response_model=SuccessResponse)
async def get_dataset_variables(
    workspace_id: str,
    exploration_id: str,
    dataset_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    await _require_workspace_member(workspace_id, current_user)
    await _require_exploration(db, workspace_id, exploration_id)
    await _require_dataset(
        db, dataset_id=dataset_id, workspace_id=workspace_id, exploration_id=exploration_id
    )

    variables = await dp_service.list_variables(db, dataset_id=dataset_id)
    return SuccessResponse(
        message="Variables fetched",
        data=VariablesListOut(
            dataset_id=dataset_id,
            variables=[VariableOut.model_validate(v) for v in variables],
        ),
    )


@router.get("/datasets/{dataset_id}/rows", response_model=SuccessResponse)
async def get_dataset_rows(
    workspace_id: str,
    exploration_id: str,
    dataset_id: str,
    mode: str = Query(..., pattern="^(coded|labelled)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Paginated respondent-level grid backing Coded Data (mode=coded, shows
    "<code> = <label>") and Labelled Data (mode=labelled, label only)."""
    await _require_workspace_member(workspace_id, current_user)
    await _require_exploration(db, workspace_id, exploration_id)
    dataset = await _require_dataset(
        db, dataset_id=dataset_id, workspace_id=workspace_id, exploration_id=exploration_id
    )

    try:
        result = await dp_service.get_dataset_rows(db, dataset, mode, page, page_size)
    except Exception:
        logger.exception("Data Playground rows fetch failed | dataset_id=%s", dataset_id)
        raise HTTPException(status_code=422, detail="Failed to fetch rows")

    return SuccessResponse(
        message="Rows fetched",
        data=DatasetRowsPageOut(**result),
    )


@router.post("/datasets/{dataset_id}/frequency", response_model=SuccessResponse)
async def run_frequency(
    workspace_id: str,
    exploration_id: str,
    dataset_id: str,
    payload: FrequencyRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Frequency table for one or more variables (SPSS-style: frequency,
    percent, valid percent, cumulative percent). Results are cached in
    dp_analysis, so an identical re-run of the same variable set is served
    without re-reading the file."""
    await _require_workspace_member(workspace_id, current_user)
    await _require_exploration(db, workspace_id, exploration_id)
    dataset = await _require_dataset(
        db, dataset_id=dataset_id, workspace_id=workspace_id, exploration_id=exploration_id
    )

    if not payload.variables:
        raise HTTPException(status_code=400, detail="At least one variable is required")

    try:
        result = await dp_analysis.compute_frequency(
            db, dataset, payload.variables, current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception(
            "Data Playground frequency computation failed | dataset_id=%s", dataset_id
        )
        raise HTTPException(status_code=422, detail="Failed to compute frequency")

    return SuccessResponse(
        message="Frequency computed",
        data=FrequencyResponseOut(**result),
    )


@router.post("/datasets/{dataset_id}/crosstab", response_model=SuccessResponse)
async def run_crosstab(
    workspace_id: str,
    exploration_id: str,
    dataset_id: str,
    payload: CrosstabRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Cross tab of banner variable(s) x main variable(s). V1 uses only the
    first banner variable to build columns (see compute_crosstab). Results
    are cached in dp_analysis the same way as frequency."""
    await _require_workspace_member(workspace_id, current_user)
    await _require_exploration(db, workspace_id, exploration_id)
    dataset = await _require_dataset(
        db, dataset_id=dataset_id, workspace_id=workspace_id, exploration_id=exploration_id
    )

    if not payload.banner_variables:
        raise HTTPException(status_code=400, detail="At least one banner variable is required")
    if not payload.main_variables:
        raise HTTPException(status_code=400, detail="At least one main variable is required")

    try:
        result = await dp_analysis.compute_crosstab(
            db, dataset, payload.banner_variables, payload.main_variables, current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception(
            "Data Playground crosstab computation failed | dataset_id=%s", dataset_id
        )
        raise HTTPException(status_code=422, detail="Failed to compute crosstab")

    return SuccessResponse(
        message="Crosstab computed",
        data=CrosstabResponseOut(**result),
    )


@router.post("/datasets/{dataset_id}/chart", response_model=SuccessResponse)
async def run_chart(
    workspace_id: str,
    exploration_id: str,
    dataset_id: str,
    payload: ChartRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Chart-ready series data. Without breakdown_variable, each requested
    variable becomes its own series over a shared label axis. With it
    (exactly one variable required), reuses the crosstab computation and
    transposes it into one series per breakdown category. Cached in
    dp_analysis like frequency/crosstab."""
    await _require_workspace_member(workspace_id, current_user)
    await _require_exploration(db, workspace_id, exploration_id)
    dataset = await _require_dataset(
        db, dataset_id=dataset_id, workspace_id=workspace_id, exploration_id=exploration_id
    )

    if not payload.variables:
        raise HTTPException(status_code=400, detail="At least one variable is required")

    try:
        result = await dp_analysis.compute_chart(
            db, dataset, payload.variables, payload.chart_type,
            payload.breakdown_variable, current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception(
            "Data Playground chart computation failed | dataset_id=%s", dataset_id
        )
        raise HTTPException(status_code=422, detail="Failed to compute chart")

    return SuccessResponse(
        message="Chart computed",
        data=ChartResponseOut(**result),
    )


@router.post("/datasets/{dataset_id}/insights", response_model=SuccessResponse)
async def run_insights(
    workspace_id: str,
    exploration_id: str,
    dataset_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Rule-based dataset summary — no LLM in V1. Takes no parameters beyond
    the dataset itself; cached in dp_analysis like the other analyses."""
    await _require_workspace_member(workspace_id, current_user)
    await _require_exploration(db, workspace_id, exploration_id)
    dataset = await _require_dataset(
        db, dataset_id=dataset_id, workspace_id=workspace_id, exploration_id=exploration_id
    )

    try:
        result = await dp_analysis.compute_insights(db, dataset, current_user.id)
    except Exception:
        logger.exception(
            "Data Playground insights computation failed | dataset_id=%s", dataset_id
        )
        raise HTTPException(status_code=422, detail="Failed to compute insights")

    return SuccessResponse(
        message="Insights computed",
        data=InsightsResponseOut(**result),
    )
