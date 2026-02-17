from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
from app.utils.id_generator import generate_id


class Exploration(SQLModel, table=True):
    __tablename__ = "explorations"

    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id", index=True)

    title: str = Field(max_length=255)
    description: str
    clarification_attempts: int = Field(default=0)
    is_quantitative: bool = Field(default=False, nullable=False)
    is_qualitative: bool = Field(default=False, nullable=False)
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    is_end: bool = Field(default=False, nullable=False)
    is_deleted: bool = Field(default=False, index=True)
    deleted_at: Optional[datetime] = None
