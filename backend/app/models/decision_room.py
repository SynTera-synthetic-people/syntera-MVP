from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import Text
from sqlalchemy.dialects.postgresql import JSON


class DecisionRoomSession(SQLModel, table=True):
    __tablename__ = "decision_room_session"

    id: Optional[str] = Field(default=None, primary_key=True)
    workspace_id: str = Field(index=True)
    exploration_id: str = Field(index=True)
    flow: str = Field(index=True)                    # 'qual' | 'quant'
    title: Optional[str] = Field(default=None)
    status: str = Field(default="active", index=True)  # 'active' | 'archived'
    context_rendered: str = Field(default="", sa_column=Column(Text))
    context_metadata: Dict[str, Any] = Field(sa_column=Column(JSON), default_factory=dict)
    prompt_version: str = Field(default="v1.0")
    token_total_input: int = Field(default=0)
    token_total_output: int = Field(default=0)
    cost_usd_total: float = Field(default=0.0)
    created_by: str = Field(index=True)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class DecisionRoomMessage(SQLModel, table=True):
    __tablename__ = "decision_room_message"

    id: Optional[str] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True)
    role: str = Field(index=True)           # 'user' | 'analyst'
    content: str = Field(sa_column=Column(Text))
    sequence_num: int = Field(default=0)
    model_used: Optional[str] = Field(default=None)
    token_input: Optional[int] = Field(default=None)
    token_output: Optional[int] = Field(default=None)
    cost_usd: Optional[float] = Field(default=None)
    latency_ms: Optional[int] = Field(default=None)
    evidence: Optional[List[Dict[str, Any]]] = Field(sa_column=Column(JSON), default=None)
    stream_complete: bool = Field(default=True)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
