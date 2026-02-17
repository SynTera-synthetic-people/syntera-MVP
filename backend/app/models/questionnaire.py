from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime
from typing import List, Optional
from app.utils.id_generator import generate_id


class QuestionnaireSection(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id")
    exploration_id: str = Field(foreign_key="explorations.id")
    simulation_id: Optional[str] = Field(default=None, index=True)
    title: str
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class QuestionnaireQuestion(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    section_id: str = Field(foreign_key="questionnairesection.id")
    text: str
    options: List[str] = Field(sa_column=Column(JSON), default_factory=list)
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
