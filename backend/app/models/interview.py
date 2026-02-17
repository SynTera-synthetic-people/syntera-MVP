from sqlmodel import SQLModel, Field, Column
from typing import Optional, List, Dict
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSON
from app.utils.id_generator import generate_id

class InterviewSection(SQLModel, table=True):
    __tablename__ = "interviewsection"
    
    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id")
    exploration_id: str = Field(foreign_key="explorations.id")
    title: str
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    description: str
    is_download: bool = Field(default=False, index=True)


class InterviewQuestion(SQLModel, table=True):
    __tablename__ = "interviewquestion"
    
    id: str = Field(default_factory=generate_id, primary_key=True)
    section_id: str = Field(foreign_key="interviewsection.id")
    text: str
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Interview(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id")
    exploration_id: str = Field(foreign_key="explorations.id")
    persona_id: Optional[str] = Field(foreign_key="persona.id", default=None)
    messages: List[dict] = Field(sa_column=Column(JSON), default_factory=list)
    generated_answers: Dict[str, dict] = Field(sa_column=Column(JSON), default_factory=dict)
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InterviewFile(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    interview_id: str = Field(foreign_key="interview.id")
    filename: str
    original_name: str
    content_type: Optional[str] = None
    size: Optional[int] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
