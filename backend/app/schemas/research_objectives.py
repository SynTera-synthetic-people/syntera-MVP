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
