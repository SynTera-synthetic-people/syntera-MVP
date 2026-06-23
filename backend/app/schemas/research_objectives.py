from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

class ResearchObjectivesCreate(BaseModel):
    description: str = Field(..., min_length=20, max_length=10000)

class ResearchObjectivesUpdate(BaseModel):
    description: str = Field(...,min_length=20,max_length=10000)

class ResearchObjectivesFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    original_name: str
    size: Optional[int]
    content_type: Optional[str]
    uploaded_at: datetime

class ResearchObjectivesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exploration_id: str
    description: str
    files: List[ResearchObjectivesFileOut] = Field(default_factory=list)
    created_by: str
    created_at: datetime

class ResearchObjectivesSummaryPatch(BaseModel):
    description: str = Field(..., min_length=2, max_length=50000)

class ResearchObjectiveFramerInput(BaseModel):
    """Structured payload from the Research Objective Framer wizard."""
    brand_name: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    competitors: List[str] = Field(default_factory=list)

    business_context: Optional[str] = None
    decision_problem: Optional[str] = None
    information_gap: Optional[str] = None
    primary_hypothesis: Optional[str] = None
    secondary_hypotheses: Optional[str] = None
    target_audience: Optional[str] = None
    segmentation_logic: Optional[str] = None
    competitive_frame: Optional[str] = None
    behaviors_attitudes: Optional[str] = None
    geography: Optional[str] = None
