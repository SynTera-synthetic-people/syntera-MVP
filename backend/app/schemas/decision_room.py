from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class CreateSessionRequest(BaseModel):
    flow: str  # 'qual' | 'quant'


class SendMessageRequest(BaseModel):
    text: str


class EvidenceItem(BaseModel):
    ref_id: str
    source_type: str
    source_id: Optional[str] = None
    grade: Optional[str] = None


class MessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    sequence_num: int
    model_used: Optional[str] = None
    token_input: Optional[int] = None
    token_output: Optional[int] = None
    cost_usd: Optional[float] = None
    latency_ms: Optional[int] = None
    evidence: Optional[List[Dict[str, Any]]] = None
    stream_complete: bool
    created_at: Optional[datetime] = None


class ContextSummary(BaseModel):
    personas_loaded: int
    report_source: Optional[str] = None
    token_estimate: int
    flow: str


class CreateSessionOut(BaseModel):
    status: str
    message: str
    data: Dict[str, Any]


class SendMessageOut(BaseModel):
    status: str
    message: str
    data: Dict[str, Any]


class SessionListItem(BaseModel):
    id: str
    title: Optional[str] = None
    flow: str
    status: str
    message_count: int
    token_total_input: int
    token_total_output: int
    cost_usd_total: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SessionDetail(BaseModel):
    id: str
    flow: str
    title: Optional[str] = None
    status: str
    prompt_version: str
    context_summary: Optional[Dict[str, Any]] = None
    messages: List[MessageOut]
    token_total_input: int
    token_total_output: int
    cost_usd_total: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DeleteSessionOut(BaseModel):
    status: str
    message: str
