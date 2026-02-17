from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from app.models.omi import OmiState
from app.models.omi import WorkflowStage


class OmiWorkflowEventIn(BaseModel):
    session_id: Optional[str] = None
    stage: Optional[str] = None
    event: str               # e.g. PERSONA_SELECTED
    payload: Dict[str, Any]  # event-specific data


class OmiWorkflowResponse(BaseModel):
    message: str
    omi_state: OmiState
    visual_state: str        # "notepad" | "typing" | "idle"
    cta: Optional[str] = None
    next_expected_event: Optional[str] = None
    tips: Optional[List[str]] = None
    warnings: Optional[List[str]] = None
