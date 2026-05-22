from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional


class QuestionnaireGenerateRequest(BaseModel):
    exploration_id: str
    persona_id: Optional[list[str]] = None
    simulation_id: Optional[str] = None


class SectionCreate(BaseModel):
    title: str
    simulation_id: Optional[str] = None
    parent_section_id: Optional[str] = None
    order_index: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SectionUpdate(BaseModel):
    title: str
    parent_section_id: Optional[str] = None
    order_index: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class QuestionCreate(BaseModel):
    text: str
    options: List[Any] = Field(default_factory=list)
    question_type: Optional[str] = None
    question_key: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    order_index: Optional[int] = None


class QuestionUpdate(BaseModel):
    text: str
    options: List[Any] = Field(default_factory=list)
    question_type: Optional[str] = None
    question_key: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    order_index: Optional[int] = None


class SectionReorderItem(BaseModel):
    section_id: str
    order_index: int
    parent_section_id: Optional[str] = None


class QuestionReorderItem(BaseModel):
    question_id: str
    order_index: int
    section_id: Optional[str] = None
