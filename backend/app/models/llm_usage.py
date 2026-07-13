from typing import Optional, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import Text
from sqlalchemy.dialects.postgresql import JSONB
from app.utils.id_generator import generate_id


class LLMUsageEvent(SQLModel, table=True):
    __tablename__ = "llm_usage_event"

    id: str = Field(default_factory=generate_id, primary_key=True)
    exploration_id: str = Field(index=True)
    workspace_id: Optional[str] = Field(default=None, index=True)

    stage: str = Field(index=True)                   # coarse taxonomy, see plan docs/llm_usage_tracking_plan.md
    operation: Optional[str] = Field(default=None)    # fine-grained sub-label
    provider: str = Field(index=True)                 # "openai" | "anthropic"
    model: str = Field(index=True)                     # raw model string

    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    cost_usd: Optional[float] = Field(default=None)   # NULL when rate unknown
    latency_ms: Optional[int] = Field(default=None)
    usage_raw: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))

    status: str = Field(default="success")            # "success" | "error"
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))

    persona_id: Optional[str] = Field(default=None, index=True)
    session_id: Optional[str] = Field(default=None, index=True)
    request_id: Optional[str] = Field(default=None, index=True)

    created_by: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
