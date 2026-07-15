"""Persistence for the artifact stimulus pipeline (Stages 1-4).

One ArtifactPipelineRun row per pipeline invocation (one or more source
assets, one shared discussion guide), with one PersonaArtifactResponse row
per persona answering that guide — mirroring how Interview already stores
messages/generated_answers as JSON on a workspace/exploration/persona-scoped
row (app/models/interview.py), rather than decision_room's per-message-table
split, since each stage here produces exactly one guide/dissection set per
run (not a growing message thread).

Token/cost tracking is NOT duplicated here — app.services.llm_usage_tracker's
llm_usage_event table (keyed by exploration_id + stage) is the single source
of truth for that, per the Step C instruction superseding the older
decision_room-style per-row cost columns.

Every JSON column stores the Phase 1 Pydantic models' .model_dump() output
(app.schemas.artifact_pipeline) — never raw, unvalidated LLM output.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlmodel import Field, SQLModel

from app.utils.id_generator import generate_id


class ArtifactPipelineRun(SQLModel, table=True):
    __tablename__ = "artifact_pipeline_run"

    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id")
    exploration_id: str = Field(foreign_key="explorations.id", index=True)
    created_by: str = Field(foreign_key="user.id")

    # NOTE: two distinct concepts, both named "artifact_type" as a bare
    # parameter in the original stage services — kept as separate columns
    # here to avoid that collision leaking into persistence.
    artifact_type: str  # media type Stage 1 needs to read the asset(s): "image" | "video" | "url"
    artifact_category: str  # dimension-library key Stage 2 needs, e.g. "ad_creative" | "product_concept" | ...
    comparison_mode: str  # ComparisonMode.value: "campaign_set" | "comparison"
    num_assets: int = Field(default=1)
    instruction: str = Field(sa_column=Column(Text))
    # Snapshotted at run creation (not re-read live from ResearchObjectives),
    # so a later RO edit can't retroactively change what this run was scored
    # against — same rationale as DecisionRoomSession.context_rendered.
    ro_description: str = Field(sa_column=Column(Text))

    # ResearchObjectivesFile.id values for the source asset(s). A JSON array
    # rather than a child table since a run always reads them as one ordered
    # set (asset_0, asset_1, ...) — never queried or FK-joined individually.
    source_file_ids: List[str] = Field(sa_column=Column(JSON), default_factory=list)
    # persona.id values this run answers the guide for. Drives Stage 4's
    # fan-out and lets resume logic know the full requested set up front.
    persona_ids: List[str] = Field(sa_column=Column(JSON), default_factory=list)

    # "pending" | "dissecting" | "selecting_dimensions" | "generating_guide"
    # | "generating_responses" | "completed" | "failed"
    status: str = Field(default="pending", index=True)
    error_stage: Optional[str] = Field(default=None)
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Stage 1 output: AssetDissection.model_dump() per asset, keyed "asset_0", "asset_1", ...
    asset_dissections: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    # Stage 2 output: DimensionSelection.model_dump()
    dimension_selection: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    # Stage 3 output: DiscussionGuide.model_dump()
    discussion_guide: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PersonaArtifactResponse(SQLModel, table=True):
    __tablename__ = "persona_artifact_response"

    id: str = Field(default_factory=generate_id, primary_key=True)
    run_id: str = Field(foreign_key="artifact_pipeline_run.id", index=True)
    persona_id: str = Field(foreign_key="persona.id", index=True)

    # "pending" | "completed" | "failed" — per-persona, so one persona's
    # failure never blocks or hides the others' results within the same run.
    status: str = Field(default="pending", index=True)
    # Stage 4 output: PersonaResponseSet.model_dump()
    response: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
