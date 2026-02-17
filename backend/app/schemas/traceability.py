from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from datetime import datetime

class TraceabilityGenerateRequest(BaseModel):
    created_by: Optional[str] = None
    custom_notes: Optional[str] = None


class TraceabilityOut(BaseModel):
    id: str
    workspace_id: str
    exploration_id: str

    foundation_layer: Dict[str, Any]
    generation_process: Dict[str, Any]
    validation_layer: Dict[str, Any]

    narrative_summary: Dict[str, Any]

    created_by: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class TraceabilityLayer(TraceabilityOut):
    exploration_id: str
