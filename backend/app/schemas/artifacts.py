from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.schemas.artifact_pipeline import ComparisonMode


class CreateArtifactRunRequest(BaseModel):
    source_file_ids: List[str]
    persona_ids: List[str]
    instruction: str
    artifact_type: str  # media type Stage 1 needs: "image" | "video" | "url"
    # Both optional — create_run derives them from the selected files'
    # ResearchObjectivesFile.artifact_category/.comparison_mode (set once at
    # upload time in the Framer's Artifact section) when omitted. Passing
    # either explicitly always overrides the derived value.
    artifact_category: Optional[str] = None  # dimension-library key, e.g. "ad_creative"
    comparison_mode: Optional[ComparisonMode] = None


class CreateArtifactRunOut(BaseModel):
    status: str = "success"
    message: str
    data: Dict[str, Any]


class PersonaProgress(BaseModel):
    total: int
    completed: int
    failed: int
    pending: int


class ArtifactRunStatusOut(BaseModel):
    id: str
    status: str
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
    error_stage: Optional[str] = None
    error_message: Optional[str] = None
    asset_dissections: Optional[Dict[str, Any]] = None
    dimension_selection: Optional[Dict[str, Any]] = None
    discussion_guide: Optional[Dict[str, Any]] = None
    persona_responses: List[PersonaArtifactResultOut] = []
