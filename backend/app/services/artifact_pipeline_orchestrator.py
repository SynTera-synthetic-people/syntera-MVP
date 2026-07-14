"""Orchestrates the artifact stimulus pipeline (Stages 1-4) end-to-end.

Does not reimplement any stage's LLM logic — it sequences the four existing
services (artifact_dissection, dimension_extraction, discussion_guide,
persona_response), resolves source assets/personas from the existing
ResearchObjectivesFile/Persona tables, checkpoints each stage's validated
output to ArtifactPipelineRun/PersonaArtifactResponse before starting the
next stage, and fans Stage 4 out across personas with bounded concurrency
and per-persona failure isolation.

Resumability: run_artifact_pipeline(run_id) is safe to call again on a run
that previously failed. Stages 1-3 are skipped entirely if their output is
already persisted (no LLM re-call, no re-billing). Stage 4 has its own
finer-grained per-persona resume, since it produces one row per persona
rather than one monolithic stage output.

Each stage function opens and closes its own AsyncSession rather than
sharing one across the whole run, so there is no cross-stage ORM-object
lifetime to reason about, and Stage 4's concurrent persona tasks never share
a session (AsyncSession is not safe for concurrent use).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Awaitable, Callable, Optional

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import async_engine
from app.models.artifact_pipeline import ArtifactPipelineRun, PersonaArtifactResponse
from app.models.persona import Persona
from app.models.research_objectives import ResearchObjectives, ResearchObjectivesFile
from app.schemas.artifact_pipeline import (
    AssetDissection,
    ComparisonMode,
    DimensionSelection,
    DiscussionGuide,
    PipelineStageError,
)
from app.utils.id_generator import generate_id
from app.services.artifact_dissection import AssetDissectionService
from app.services.dimension_extraction import DimensionExtractionService
from app.services.discussion_guide import DiscussionGuideService
from app.services.persona_response import PersonaResponseService
from app.utils.file_utils import material_file_path

logger = logging.getLogger(__name__)


class ArtifactRunValidationError(ValueError):
    """Raised by create_run() for a bad request (unknown/foreign file or
    persona ids, empty lists, mode/asset-count mismatch, no RO yet) — the
    router maps this to a 400, not a 500."""


# Frontend's comparison-mode vocabulary (ResearchObjectiveFramer.tsx's
# ArtifactCategory: "compare" | "campaign_set") mapped to ComparisonMode.
# Not renamed on the wire/DB to avoid rippling a rename through the FE and
# the research_objectives_file.comparison_mode column.
_FE_COMPARISON_MODE_MAP: dict[str, ComparisonMode] = {
    "compare": ComparisonMode.COMPARISON,
    "comparison": ComparisonMode.COMPARISON,  # accept the pipeline's own spelling too
    "campaign_set": ComparisonMode.CAMPAIGN_SET,
}


async def create_run(
    *,
    workspace_id: str,
    exploration_id: str,
    created_by: str,
    source_file_ids: list[str],
    persona_ids: list[str],
    instruction: str,
    artifact_type: str,
    artifact_category: Optional[str] = None,
    comparison_mode: Optional[ComparisonMode] = None,
) -> str:
    """Validates the request against this exploration's own data, snapshots
    the exploration's current ResearchObjectives.description onto the run
    (see ArtifactPipelineRun.ro_description), creates the row, and returns
    its id. Does not start the pipeline — the caller (router) schedules
    run_artifact_pipeline(run_id) itself, e.g. via BackgroundTasks.

    artifact_category/comparison_mode are optional: when omitted, both are
    derived from the selected source_file_ids' own stored
    ResearchObjectivesFile.artifact_category/.comparison_mode (set once, at
    upload time, in the Framer's Artifact section — see
    submit_framer_material_section). Passing either explicitly always wins,
    which also keeps this backward compatible with legacy artifact files
    that predate those columns and have them NULL.
    """
    if not source_file_ids:
        raise ArtifactRunValidationError("source_file_ids must not be empty")
    if not persona_ids:
        raise ArtifactRunValidationError("persona_ids must not be empty")

    async with AsyncSession(async_engine) as db:
        file_result = await db.execute(
            select(ResearchObjectivesFile).where(
                ResearchObjectivesFile.id.in_(source_file_ids),
                ResearchObjectivesFile.exploration_id == exploration_id,
                ResearchObjectivesFile.material_kind == "artifact",
            )
        )
        found_files = {f.id: f for f in file_result.scalars().all()}
        missing_files = set(source_file_ids) - set(found_files.keys())
        if missing_files:
            raise ArtifactRunValidationError(
                "source_file_ids not found for this exploration as material_kind='artifact': "
                f"{sorted(missing_files)}"
            )

        if artifact_category is None:
            file_categories = {
                f.artifact_category for f in found_files.values() if f.artifact_category
            }
            if len(file_categories) > 1:
                raise ArtifactRunValidationError(
                    f"selected files have inconsistent artifact_category values {sorted(file_categories)} "
                    "— pass artifact_category explicitly to resolve"
                )
            if len(file_categories) == 1:
                artifact_category = next(iter(file_categories))
            else:
                raise ArtifactRunValidationError(
                    "artifact_category was not provided and none of the selected files have one stored "
                    "(likely a pre-migration upload) — pass artifact_category explicitly"
                )

        if comparison_mode is None:
            file_modes = {
                _FE_COMPARISON_MODE_MAP[f.comparison_mode]
                for f in found_files.values()
                if f.comparison_mode in _FE_COMPARISON_MODE_MAP
            }
            if len(file_modes) > 1:
                raise ArtifactRunValidationError(
                    "selected files have inconsistent comparison_mode values — "
                    "pass comparison_mode explicitly to resolve"
                )
            if len(file_modes) == 1:
                comparison_mode = next(iter(file_modes))
            else:
                # Legacy files with no stored comparison_mode — fall back on
                # asset count, same default a single/multi selection implies.
                comparison_mode = (
                    ComparisonMode.COMPARISON if len(source_file_ids) > 1 else ComparisonMode.CAMPAIGN_SET
                )
        else:
            comparison_mode = ComparisonMode(comparison_mode)

        if comparison_mode == ComparisonMode.COMPARISON and len(source_file_ids) < 2:
            raise ArtifactRunValidationError("comparison mode requires at least 2 source_file_ids")
        if comparison_mode == ComparisonMode.CAMPAIGN_SET and len(source_file_ids) != 1:
            raise ArtifactRunValidationError("campaign_set mode requires exactly 1 source_file_id")

        persona_result = await db.execute(
            select(Persona).where(Persona.id.in_(persona_ids), Persona.exploration_id == exploration_id)
        )
        found_persona_ids = {p.id for p in persona_result.scalars().all()}
        missing_personas = set(persona_ids) - found_persona_ids
        if missing_personas:
            raise ArtifactRunValidationError(
                f"persona_ids not found for this exploration: {sorted(missing_personas)}"
            )

        ro_result = await db.execute(
            select(ResearchObjectives)
            .where(ResearchObjectives.exploration_id == exploration_id)
            .order_by(ResearchObjectives.created_at.desc())
        )
        ro = ro_result.scalars().first()
        if ro is None:
            raise ArtifactRunValidationError("exploration has no research objective yet")

        run_id = generate_id()
        run = ArtifactPipelineRun(
            id=run_id,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            created_by=created_by,
            artifact_type=artifact_type,
            artifact_category=artifact_category,
            comparison_mode=comparison_mode.value,
            num_assets=len(source_file_ids),
            instruction=instruction,
            ro_description=ro.description,
            source_file_ids=list(source_file_ids),
            persona_ids=list(persona_ids),
        )
        db.add(run)
        await db.commit()

    return run_id


async def list_artifact_files(exploration_id: str) -> list[dict]:
    """Plain-dict listing of this exploration's material_kind="artifact"
    files — for a UI file picker feeding create_run's source_file_ids.
    Read-only; does not touch the existing research_objectives material
    upload/extraction flow."""
    async with AsyncSession(async_engine) as db:
        result = await db.execute(
            select(ResearchObjectivesFile).where(
                ResearchObjectivesFile.exploration_id == exploration_id,
                ResearchObjectivesFile.material_kind == "artifact",
            )
        )
        return [
            {
                "id": f.id,
                "original_name": f.original_name,
                "has_file": bool(f.filename),
                "source_url": f.source_url,
                "artifact_category": f.artifact_category,
                "comparison_mode": f.comparison_mode,
            }
            for f in result.scalars().all()
        ]


async def get_run_status(run_id: str) -> Optional[dict]:
    """Plain-dict status summary for GET /runs/{run_id} — includes
    workspace_id/exploration_id so the router can enforce path-scoping
    without a second query."""
    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)
        if run is None:
            return None

        persona_rows = (
            await db.execute(select(PersonaArtifactResponse).where(PersonaArtifactResponse.run_id == run_id))
        ).scalars().all()
        total = len(run.persona_ids)
        completed = sum(1 for r in persona_rows if r.status == "completed")
        failed = sum(1 for r in persona_rows if r.status == "failed")

        return {
            "id": run.id,
            "workspace_id": run.workspace_id,
            "exploration_id": run.exploration_id,
            "status": run.status,
            "error_stage": run.error_stage,
            "error_message": run.error_message,
            "stages_completed": {
                "dissecting": run.asset_dissections is not None,
                "selecting_dimensions": run.dimension_selection is not None,
                "generating_guide": run.discussion_guide is not None,
                "generating_responses": total > 0 and (completed + failed) >= total,
            },
            "persona_progress": {
                "total": total,
                "completed": completed,
                "failed": failed,
                "pending": total - completed - failed,
            },
            "created_at": run.created_at,
            "updated_at": run.updated_at,
        }


async def get_run_results(run_id: str) -> Optional[dict]:
    """Plain-dict full results for GET /runs/{run_id}/results — safe to call
    on a run that's still in progress or failed mid-way; returns whatever
    stage output has been persisted so far, plus per-persona results."""
    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)
        if run is None:
            return None

        persona_rows = (
            await db.execute(select(PersonaArtifactResponse).where(PersonaArtifactResponse.run_id == run_id))
        ).scalars().all()

        return {
            "id": run.id,
            "workspace_id": run.workspace_id,
            "exploration_id": run.exploration_id,
            "status": run.status,
            "error_stage": run.error_stage,
            "error_message": run.error_message,
            "asset_dissections": run.asset_dissections,
            "dimension_selection": run.dimension_selection,
            "discussion_guide": run.discussion_guide,
            "persona_responses": [
                {
                    "persona_id": r.persona_id,
                    "status": r.status,
                    "response": r.response,
                    "error_message": r.error_message,
                }
                for r in persona_rows
            ],
        }


def _resolve_asset(file_row: ResearchObjectivesFile) -> str:
    """Resolves a ResearchObjectivesFile row (material_kind="artifact") to the
    asset string AssetDissectionService expects: a local path for an uploaded
    file, or the pasted link for a link-only material. No new upload/storage
    mechanism — reuses the existing Framer "Add Material" -> Artifact path.

    KNOWN GAP: MATERIAL_ALLOWED_EXT (app/utils/file_utils.py) only accepts
    image/document extensions today, not video — so a video-artifact_type
    run can only be sourced from a pasted link (source_url), never an
    uploaded file, until that upload allowlist is extended. Not addressed
    here.
    """
    if file_row.filename:
        return str(material_file_path(file_row.filename))
    if file_row.source_url:
        return file_row.source_url
    raise PipelineStageError(
        "asset_dissection",
        f"ResearchObjectivesFile {file_row.id} has neither a stored file nor a source_url",
    )


async def _run_dissection_stage(run_id: str) -> None:
    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)

        file_result = await db.execute(
            select(ResearchObjectivesFile).where(ResearchObjectivesFile.id.in_(run.source_file_ids))
        )
        files_by_id = {f.id: f for f in file_result.scalars().all()}
        missing = [fid for fid in run.source_file_ids if fid not in files_by_id]
        if missing:
            raise PipelineStageError(
                "asset_dissection", f"source ResearchObjectivesFile id(s) not found: {missing}"
            )
        ordered_assets = [_resolve_asset(files_by_id[fid]) for fid in run.source_file_ids]

        isolate_failures = (
            run.comparison_mode == ComparisonMode.COMPARISON.value and len(ordered_assets) > 1
        )
        service = AssetDissectionService()
        raw = await service.dissect_assets(
            assets=ordered_assets,
            instruction=run.instruction,
            artifact_type=run.artifact_type,
            isolate_failures=isolate_failures,
            exploration_id=run.exploration_id,
            workspace_id=run.workspace_id,
            created_by=run.created_by,
            session_id=run.id,
        )

        validated: dict[str, Any] = {}
        for key, value in raw.items():
            if isinstance(value, dict) and set(value.keys()) == {"error"}:
                # Per-asset failure placeholder from isolate_failures=True — kept
                # as-is rather than schema-validated, so partial results survive.
                validated[key] = value
                continue
            try:
                validated[key] = AssetDissection.model_validate(value).model_dump()
            except ValidationError as exc:
                raise PipelineStageError(
                    "asset_dissection", f"{key} failed schema validation: {exc}"
                ) from exc

        run.asset_dissections = validated
        run.updated_at = datetime.utcnow()
        db.add(run)
        await db.commit()


async def _run_dimension_stage(run_id: str) -> None:
    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)
        service = DimensionExtractionService()
        selection = await service.extract_dimensions(
            ro_description=run.ro_description,
            instruction=run.instruction,
            artifact_type=run.artifact_category,
            exploration_id=run.exploration_id,
            workspace_id=run.workspace_id,
            created_by=run.created_by,
            session_id=run.id,
        )
        run.dimension_selection = selection.model_dump()
        run.updated_at = datetime.utcnow()
        db.add(run)
        await db.commit()


async def _run_guide_stage(run_id: str) -> None:
    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)
        dim_selection = DimensionSelection.model_validate(run.dimension_selection)
        service = DiscussionGuideService()
        guide = await service.generate_guide(
            ro_description=run.ro_description,
            instruction=run.instruction,
            selected_dimensions=dim_selection.selected_codes,
            dimension_details={k: v.model_dump() for k, v in dim_selection.details.items()},
            comparison_mode=ComparisonMode(run.comparison_mode),
            num_assets=run.num_assets,
            is_qual=True,
            exploration_id=run.exploration_id,
            workspace_id=run.workspace_id,
            created_by=run.created_by,
            session_id=run.id,
        )
        run.discussion_guide = guide.model_dump()
        run.updated_at = datetime.utcnow()
        db.add(run)
        await db.commit()


async def _save_persona_response(
    run_id: str,
    persona_id: str,
    *,
    status: str,
    response: Optional[dict] = None,
    error_message: Optional[str] = None,
) -> None:
    """Independent short-lived session per call — safe to call concurrently
    from multiple in-flight persona tasks: each persona owns a distinct row
    (no cross-task contention), and each call opens its own connection
    rather than sharing one AsyncSession across concurrent coroutines."""
    async with AsyncSession(async_engine) as db:
        result = await db.execute(
            select(PersonaArtifactResponse).where(
                PersonaArtifactResponse.run_id == run_id,
                PersonaArtifactResponse.persona_id == persona_id,
            )
        )
        row = result.scalars().first()
        now = datetime.utcnow()
        if row is None:
            row = PersonaArtifactResponse(
                run_id=run_id,
                persona_id=persona_id,
                status=status,
                response=response,
                error_message=error_message,
                created_at=now,
                updated_at=now,
            )
        else:
            row.status = status
            row.response = response
            row.error_message = error_message
            row.updated_at = now
        db.add(row)
        await db.commit()


async def _run_persona_stage(run_id: str) -> None:
    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)

        persona_result = await db.execute(select(Persona).where(Persona.id.in_(run.persona_ids)))
        # .model_dump() now, before this session closes — Persona rows fetched
        # via a bare AsyncSession(async_engine) (not the expire_on_commit=False
        # sessionmaker in app.db) expire on commit/close, same as
        # decision_room.py's "cache primitive values now" pattern.
        personas_by_id = {p.id: p.model_dump(mode="json") for p in persona_result.scalars().all()}

        existing_result = await db.execute(
            select(PersonaArtifactResponse).where(PersonaArtifactResponse.run_id == run.id)
        )
        completed_persona_ids = {
            row.persona_id for row in existing_result.scalars().all() if row.status == "completed"
        }

        exploration_id = run.exploration_id
        workspace_id = run.workspace_id
        created_by = run.created_by
        comparison_mode = ComparisonMode(run.comparison_mode)
        dissections = run.asset_dissections or {}
        guide = DiscussionGuide.model_validate(run.discussion_guide)
        persona_ids = list(run.persona_ids)

    service = PersonaResponseService()
    semaphore = asyncio.Semaphore(settings.ARTIFACT_PERSONA_CONCURRENCY)

    async def _one(persona_id: str) -> None:
        if persona_id in completed_persona_ids:
            logger.info("Run %s: persona %s already completed, skipping (resume)", run_id, persona_id)
            return

        persona_dict = personas_by_id.get(persona_id)
        if persona_dict is None:
            logger.error("Run %s: persona %s not found", run_id, persona_id)
            await _save_persona_response(
                run_id, persona_id, status="failed", error_message="persona not found"
            )
            return

        async with semaphore:
            try:
                result = await service.generate_persona_responses(
                    persona=persona_dict,
                    asset_dissections=dissections,
                    discussion_guide=guide,
                    comparison_mode=comparison_mode,
                    exploration_id=exploration_id,
                    workspace_id=workspace_id,
                    created_by=created_by,
                    session_id=run_id,
                    persona_id=persona_id,
                )
            except Exception as exc:
                logger.error("Run %s: persona %s failed (isolated): %s", run_id, persona_id, exc)
                await _save_persona_response(
                    run_id, persona_id, status="failed", error_message=str(exc)[:4000]
                )
                return

        await _save_persona_response(run_id, persona_id, status="completed", response=result.model_dump())

    await asyncio.gather(*(_one(pid) for pid in persona_ids))


_STAGE_PLAN: tuple[tuple[str, Callable[[str], Awaitable[None]]], ...] = (
    ("dissecting", _run_dissection_stage),
    ("selecting_dimensions", _run_dimension_stage),
    ("generating_guide", _run_guide_stage),
    ("generating_responses", _run_persona_stage),
)


def _stage_already_done(run: ArtifactPipelineRun, stage_name: str) -> bool:
    if stage_name == "dissecting":
        return run.asset_dissections is not None
    if stage_name == "selecting_dimensions":
        return run.dimension_selection is not None
    if stage_name == "generating_guide":
        return run.discussion_guide is not None
    # "generating_responses": always re-entered — its resume granularity is
    # per-persona (see _run_persona_stage), not per-stage. Re-entering a run
    # where every persona already succeeded is a cheap no-op (two SELECTs,
    # then an asyncio.gather of immediate skips).
    return False


async def run_artifact_pipeline(run_id: str) -> None:
    """Entry point: executes the run's remaining stages in order, checkpointing
    status + validated output after each one. See module docstring for the
    resumability/concurrency/isolation guarantees.
    """
    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)
        if run is None:
            logger.error("run_artifact_pipeline: no ArtifactPipelineRun with id %s", run_id)
            return
        if run.status == "completed":
            logger.info("Run %s already completed, nothing to do", run_id)
            return

    for stage_name, stage_fn in _STAGE_PLAN:
        async with AsyncSession(async_engine) as db:
            run = await db.get(ArtifactPipelineRun, run_id)
            if run is None:
                logger.error("run_artifact_pipeline: ArtifactPipelineRun %s disappeared mid-run", run_id)
                return
            if _stage_already_done(run, stage_name):
                logger.info("Run %s: stage %s already has persisted output, skipping (resume)", run_id, stage_name)
                continue
            run.status = stage_name
            run.error_stage = None
            run.error_message = None
            run.updated_at = datetime.utcnow()
            db.add(run)
            await db.commit()

        try:
            await stage_fn(run_id)
        except Exception as exc:
            logger.exception("Artifact pipeline run %s failed at stage %s", run_id, stage_name)
            async with AsyncSession(async_engine) as db:
                run = await db.get(ArtifactPipelineRun, run_id)
                if run is not None:
                    run.status = "failed"
                    run.error_stage = stage_name
                    run.error_message = str(exc)[:4000]
                    run.updated_at = datetime.utcnow()
                    db.add(run)
                    await db.commit()
            return

    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)
        if run is not None:
            run.status = "completed"
            run.error_stage = None
            run.error_message = None
            run.updated_at = datetime.utcnow()
            db.add(run)
            await db.commit()
