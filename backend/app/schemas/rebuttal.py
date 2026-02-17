# app/schemas/rebuttal.py
from __future__ import annotations
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel


class QuestionItem(BaseModel):
    id: str
    text: str
    options: List[str] = []
    survey_results: Optional[List[Dict[str, Any]]] = None  # [{option, count, pct}]


class SectionOut(BaseModel):
    title: str
    questions: List[QuestionItem] = []


class RebuttalStartRequest(BaseModel):
    persona_id: Union[str, List[str]]  # Accept both string and list for backward compatibility
    simulation_id: Optional[str] = None
    question_id: str
    sample_size: Optional[int] = None



class RebuttalStartOut(BaseModel):
    session_id: str
    starter_message: str
    question: QuestionItem


class RebuttalReplyRequest(BaseModel):
    session_id: str
    user_message: str


class RebuttalReplyOut(BaseModel):
    session_id: str
    llm_response: str
    metadata: Optional[Dict[str, Any]] = None


class RebuttalSessionOut(BaseModel):
    id: str
    workspace_id: str
    exploration_id: Optional[str]
    persona_id: str
    simulation_id: Optional[str]
    question_id: str
    starter_message: Optional[str]
    messages: List[Dict[str, Any]] = []
    user_message: Optional[str]
    llm_response: Optional[str]
    created_by: Optional[str]
    created_at: Optional[str]
    responded_at: Optional[str]


class RebuttalSessionListItem(BaseModel):
    id: str
    workspace_id: str
    exploration_id: Optional[str]
    persona_id: str
    simulation_id: Optional[str]
    question_id: str
    question_text: str
    starter_message: Optional[str]
    message_count: int
    created_by: Optional[str]
    created_at: Optional[str]
    responded_at: Optional[str]