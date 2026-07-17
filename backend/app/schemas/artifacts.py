from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.schemas.artifact_pipeline import ComparisonMode, RunType


class CreateArtifactRunRequest(BaseModel):
    """Kicks off Stages 1-3 only (dissection -> dimensions -> guide/questionnaire).
    No persona_ids here — persona selection happens afterwards, once the
    guide/questionnaire is ready to review. See GenerateArtifactPersonaResponsesRequest
    (qual) / GenerateArtifactPopulationRequest (quant) below for Stage 4."""

    source_file_ids: List[str]
    instruction: str
    artifact_type: str  # media type Stage 1 needs: "image" | "video" | "url"
    # Both optional — create_run derives them from the selected files'
    # ResearchObjectivesFile.artifact_category/.comparison_mode (set once at
    # upload time in the Framer's Artifact section) when omitted. Passing
    # either explicitly always overrides the derived value.
    artifact_category: Optional[str] = None  # dimension-library key, e.g. "ad_creative"
    comparison_mode: Optional[ComparisonMode] = None
    # "qual" (open-ended discussion guide + free-text persona answers,
    # default) or "quant" (rating-scale questionnaire + population
    # simulation). Only Stage 3/4 branch on this — Stage 1/2 are identical
    # either way.
    run_type: RunType = RunType.QUAL


class CreateArtifactRunOut(BaseModel):
    status: str = "success"
    message: str
    data: Dict[str, Any]


class GenerateArtifactPersonaResponsesRequest(BaseModel):
    """Qual Stage 4 trigger: POST .../runs/{run_id}/personas, once the
    discussion guide is ready. Each listed persona individually answers
    every guide question."""

    persona_ids: List[str]


class PersonaSelectionItem(BaseModel):
    persona_id: str
    sample_size: int


class GenerateArtifactPopulationRequest(BaseModel):
    """Quant Stage 4 trigger: POST .../runs/{run_id}/population-simulation,
    once the questionnaire is ready. Each persona represents a cohort of
    sample_size simulated respondents; results are one combined,
    sample-size-weighted distribution across all cohorts."""

    personas_selection: List[PersonaSelectionItem]


class PersonaProgress(BaseModel):
    total: int
    completed: int
    failed: int
    pending: int


class ArtifactRunStatusOut(BaseModel):
    id: str
    status: str
    run_type: str = "qual"
    error_stage: Optional[str] = None
    error_message: Optional[str] = None
    stages_completed: Dict[str, bool]
    persona_progress: PersonaProgress
    created_at: datetime
    updated_at: datetime


class PersonaArtifactResultOut(BaseModel):
    persona_id: str
    status: str
    response: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class ArtifactRunResultsOut(BaseModel):
    id: str
    status: str
    run_type: str = "qual"
    error_stage: Optional[str] = None
    error_message: Optional[str] = None
    asset_dissections: Optional[Dict[str, Any]] = None
    dimension_selection: Optional[Dict[str, Any]] = None
    discussion_guide: Optional[Dict[str, Any]] = None
    persona_responses: List[PersonaArtifactResultOut] = []
    # Populated for quant runs only, once Stage 4 (population simulation) completes.
    population_result: Optional[Dict[str, Any]] = None
