from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from app.models.omi import OmiState, WorkflowStage


class OmiMessageCreate(BaseModel):
    content: str
    message_type: str = "guidance"


class OmiMessageOut(BaseModel):
    id: str
    role: str
    content: str
    message_type: str
    workflow_stage: Optional[str] = None
    omi_state: Optional[str] = None
    created_at: datetime


class OmiActionOut(BaseModel):
    id: str
    action_type: str
    description: str
    status: str
    progress_percentage: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None


class OmiSessionOut(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    current_stage: str
    current_state: str
    context: Dict[str, Any]
    conversation_history: List[Dict[str, Any]]
    completed_stages: List[str]
    created_at: datetime
    updated_at: datetime
    last_interaction: datetime


class OmiStateUpdate(BaseModel):
    state: OmiState
    stage: Optional[WorkflowStage] = None


# class OmiChatRequest(BaseModel):
#     message: str
#     context: Optional[Dict[str, Any]] = None


class OmiChatResponse(BaseModel):
    message: str
    omi_state: str
    suggestions: Optional[List[str]] = None
    actions: Optional[List[str]] = None
    validation: Optional[Dict[str, Any]] = None
    next_steps: Optional[List[str]] = None


class OmiGuidanceRequest(BaseModel):
    stage: WorkflowStage
    user_input: Optional[Dict[str, Any]] = None


class OmiGuidanceResponse(BaseModel):
    guidance: str
    omi_state: str
    workflow_actions: List[str]
    tips: Optional[List[str]] = None
    warnings: Optional[List[str]] = None


class OmiValidationRequest(BaseModel):
    stage: WorkflowStage
    data: Dict[str, Any]


class OmiValidationResponse(BaseModel):
    valid: bool
    message: str
    omi_state: str
    issues: Optional[List[Dict[str, str]]] = None
    suggestions: Optional[List[str]] = None

class OmiChatRequest(BaseModel):
    session_id: str
    exploration_id: str
    message: str
    context: Optional[Dict[str, Any]] = None