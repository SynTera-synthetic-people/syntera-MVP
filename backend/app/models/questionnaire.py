from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime
from typing import Any, Dict, List, Optional
from app.utils.id_generator import generate_id


class QuestionnaireSection(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id")
    exploration_id: str = Field(foreign_key="explorations.id")
    simulation_id: Optional[str] = Field(default=None, index=True)
    parent_section_id: Optional[str] = Field(default=None, index=True)
    title: str
    order_index: int = Field(default=0, index=True)
    section_metadata: Dict[str, Any] = Field(
        sa_column=Column("metadata", JSON),
        default_factory=dict,
    )
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class QuestionnaireQuestion(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    section_id: str = Field(foreign_key="questionnairesection.id")
    question_key: str = Field(default_factory=generate_id, index=True)
    question_type: str = Field(default="single_select", index=True)
    text: str
    options: List[str] = Field(sa_column=Column(JSON), default_factory=list)
    config: Dict[str, Any] = Field(sa_column=Column(JSON), default_factory=dict)
    order_index: int = Field(default=0, index=True)
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class QuestionnaireQuestionAsset(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    question_id: str = Field(foreign_key="questionnairequestion.id", index=True)
    workspace_id: str = Field(foreign_key="workspace.id", index=True)
    exploration_id: str = Field(foreign_key="explorations.id", index=True)
    filename: str
    original_name: str
    content_type: Optional[str] = None
    size: Optional[int] = None
    asset_type: str = Field(default="file", index=True)
    asset_metadata: Dict[str, Any] = Field(
        sa_column=Column("metadata", JSON),
        default_factory=dict,
    )
    uploaded_by: str = Field(foreign_key="user.id", index=True)
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
