# app/models/rebuttal.py
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSON

class RebuttalSession(SQLModel, table=True):
    id: Optional[str] = Field(default=None, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id", index=True)
    exploration_id: Optional[str] = Field(foreign_key="explorations.id", default=None, index=True)
    persona_id: str = Field(index=True)
    simulation_id: Optional[str] = Field(default=None, index=True)
    question_id: str = Field(foreign_key="questionnairequestion.id", index=True)
    starter_message: Optional[str] = Field(default=None)
    messages: List[Dict[str, Any]] = Field(sa_column=Column(JSON), default_factory=list)
    user_message: Optional[str] = Field(default=None)
    llm_response: Optional[str] = Field(default=None)
    llm_metadata: Optional[Dict[str, Any]] = Field(sa_column=Column(JSON), default=None)
    created_by: str = Field(foreign_key="user.id", index=True)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    responded_at: Optional[datetime] = Field(default=None)