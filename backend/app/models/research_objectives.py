from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import Column, JSON
from app.utils.id_generator import generate_id
import json

class ResearchObjectives(SQLModel, table=True):
    __tablename__ = "research_objectives"
    id: str = Field(default_factory=generate_id, primary_key=True)
    exploration_id: str = Field(foreign_key="explorations.id")
    description: str
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    validation_status: str
    ai_interpretation: Dict[str, Any] = Field(
        sa_column=Column(JSON),
        default_factory=dict
    )
    confidence_level: int
    files: List["ResearchObjectivesFile"] = Relationship(
        back_populates="research_objectives"
    )


class ResearchObjectivesFile(SQLModel, table=True):
    __tablename__ = "research_objectives_file"
    id: str = Field(default_factory=generate_id, primary_key=True)
    # Nullable: Framer materials are uploaded/linked before a ResearchObjectives
    # row exists (the RO is only created/updated when the wizard is submitted).
    # exploration_id is the anchor at upload time; research_objectives_id is
    # backfilled once the objective is finalized.
    research_objectives_id: Optional[str] = Field(
        default=None, foreign_key="research_objectives.id"
    )
    exploration_id: Optional[str] = Field(
        default=None, foreign_key="explorations.id", index=True
    )
    # Nullable: a link-only material (URL pasted, no file picked) has no
    # stored file — filename is None and source_url carries the link instead.
    filename: Optional[str] = None
    original_name: str
    content_type: Optional[str] = None
    size: Optional[int] = None
    source_url: Optional[str] = None
    # "brief" | "artifact" — the Framer's two Add-Material sections. Used to
    # scope replace-on-resubmit (re-submitting a section replaces only that
    # section's previous materials, not the other section's).
    material_kind: Optional[str] = None
    # Artifact-section-only (NULL for "brief" materials). The dimension-library
    # key driving Stage 2 dimension selection in the artifact stimulus pipeline
    # — e.g. "ad_creative" | "product_concept" | "packaging" | "landing_page" |
    # "pricing_offer" | "claim" | "script_storyboard". Set once per submission,
    # identical across every file/link created in that same submission.
    artifact_category: Optional[str] = None
    # Artifact-section-only (NULL for "brief" materials). The frontend's own
    # vocabulary for how Omi should relate multiple artifacts to each other:
    # "compare" | "campaign_set". Mapped to ComparisonMode by the artifact
    # pipeline's create_run (see app/services/artifact_pipeline_orchestrator.py)
    # rather than renamed here, to avoid rippling a rename through the FE.
    comparison_mode: Optional[str] = None
    # Framer-material-specific fields. extracted_context is the LLM-summarized,
    # prompt-ready representation produced at upload/fetch time (not raw
    # file/page text) — this is what gets woven into Research Objective synthesis.
    instruction: Optional[str] = None
    extracted_context: Optional[str] = None
    # "pending" | "flagged". Set to "flagged" the moment the relevance-check
    # LLM call raises a topic mismatch for this material — deterministic from
    # then on: flagged materials are excluded from every future prompt by
    # get_unlinked_materials(), so the mismatch is asked about at most once,
    # and a dismissed/ignored material can never silently re-enter generation.
    relevance_status: str = Field(default="pending")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

    research_objectives: Optional[ResearchObjectives] = Relationship(
        back_populates="files"
    )
