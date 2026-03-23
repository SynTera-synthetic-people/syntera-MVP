from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ExplorationCreate(BaseModel):
    workspace_id: str
    title: str
    description: str

class ExplorationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = Field(None, min_length=10, max_length=10000)


class ExplorationOut(BaseModel):
    id: str
    workspace_id: str
    title: str
    description: str
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime]
    is_end: Optional[bool] = None
    is_quantitative: Optional[bool] = None
    is_qualitative: Optional[bool] = None

    class Config:
        orm_mode = True


class ExplorationMethodSelect(BaseModel):
    is_quantitative: Optional[bool] = None
    is_qualitative: Optional[bool] = None
    is_end: Optional[bool] = None
