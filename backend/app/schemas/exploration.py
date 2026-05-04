from pydantic import BaseModel, ConfigDict, Field
from enum import Enum
from pydantic import BaseModel, Field, validator
from typing import Literal, Optional
from datetime import datetime


class ExplorationStep(str, Enum):
    step_1 = "step_1"       # no RO yet
    step_2 = "step_2"       # RO done, no personas
    step_3 = "step_3"       # personas exist / qualitative exploration
    step_4 = "step_4"       # quantitative exploration
    research = "research"   # legacy alias accepted by older clients
    completed = "completed"
    setup = "setup"         # coarse fallback (no DB context available)


class ExplorationCreate(BaseModel):
    workspace_id: str
    title: str
    description: str
    audience_type: Literal["B2C", "B2B"] = "B2C"

    @validator("audience_type")
    def block_b2b(cls, v):
        if v == "B2B":
            raise ValueError("B2B explorations are not yet supported. Please select B2C.")
        return v

class ExplorationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=300)
    audience_type: Optional[Literal["B2C", "B2B"]] = None


class ExplorationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    title: str
    description: str
    audience_type: str
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime]
    is_end: Optional[bool] = None
    is_quantitative: Optional[bool] = None
    is_qualitative: Optional[bool] = None
    status: Optional[str] = None
    current_step: Optional[ExplorationStep] = None
    # Sub-step within Step 3 qualitative flow: "guide" | "interviews" | "insights"
    qual_step: Optional[str] = None
    # Sub-step within Step 4 quantitative flow: "questionnaire" | "population" | "survey" | "insights"
    quant_step: Optional[str] = None

    @validator("status", always=True, pre=False)
    def compute_status(cls, v, values):
        return "Completed" if values.get("is_end") else "Ongoing"

    @validator("current_step", always=True, pre=False)
    def compute_current_step(cls, v, values):
        # Service layer pre-computes granular step for list + single-GET endpoints.
        # This validator is a last-resort fallback for any path that still passes
        # a raw ORM object without DB context (e.g. internal use).
        if v is not None:
            return v
        if values.get("is_end"):
            return ExplorationStep.completed
        if values.get("is_quantitative"):
            return ExplorationStep.step_4
        if values.get("is_qualitative"):
            return ExplorationStep.step_3
        return ExplorationStep.setup


class ExplorationMethodSelect(BaseModel):
    is_quantitative: Optional[bool] = None
    is_qualitative: Optional[bool] = None
    is_end: Optional[bool] = None
