from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class InterviewCreate(BaseModel):
    persona_id: Optional[str] = None
    # extra_questions: List[str] = Field(default_factory=list)

class MessageIn(BaseModel):
    role: str = Field(..., pattern=r"^(user|persona|system|other)$")
    text: str
    meta: Optional[Dict[str, Any]] = None

class MessageOut(BaseModel):
    role: str
    text: str
    meta: Optional[Dict[str, Any]]
    ts: datetime

class InterviewOut(BaseModel):
    id: str
    workspace_id: str
    exploration_id: str
    persona_id: Optional[str] = None
    messages: List[Dict[str, Any]] = Field(default_factory=list)
    generated_answers: Dict[str, Any] = Field(default_factory=dict)
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class InterviewSectionCreate(BaseModel):
    """Schema for creating an interview section"""
    title: str = Field(..., min_length=1, max_length=255)


class InterviewSectionUpdate(BaseModel):
    """Schema for updating an interview section"""
    title: str = Field(..., min_length=1, max_length=255)


class InterviewQuestionCreate(BaseModel):
    """Schema for creating an interview question"""
    text: str = Field(..., min_length=1)
    exploration_id: str = Field(..., min_length=1)
    is_force_insert: bool = Field(default=False)

class InterviewQuestionUpdate(BaseModel):
    """Schema for updating an interview question"""
    text: str = Field(..., min_length=1)
    exploration_id: str = Field(..., min_length=1)
    is_force_insert: bool = Field(default=False)

class InterviewQuestionDelete(BaseModel):
    """Schema for deleting an interview question"""
    exploration_id: str = Field(..., min_length=1)
    is_force_insert: bool = Field(default=False)