from pydantic import BaseModel
from typing import List, Dict, Optional


class QuestionnaireGenerateRequest(BaseModel):
    exploration_id: str
    persona_id: Optional[list[str]] = None
    simulation_id: Optional[str] = None


class SectionCreate(BaseModel):
    title: str


class SectionUpdate(BaseModel):
    title: str


class QuestionCreate(BaseModel):
    text: str
    options: List[str]


class QuestionUpdate(BaseModel):
    text: str
    options: List[str]
