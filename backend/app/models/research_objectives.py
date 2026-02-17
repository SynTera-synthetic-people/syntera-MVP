from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import Column, JSON
from app.utils.id_generator import generate_id
import json

class ResearchObjectives(SQLModel, table=True):
    __tablename__ = "research_objectives"
    id: str = Field(default_factory=generate_id, primary_key=True)
    exploration_id: str = Field(foreign_key="explorations.id")
    description: str
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    validation_status: str
    ai_interpretation: Dict[str, Any] = Field(
        sa_column=Column(JSON),
        default_factory=dict
    )
    confidence_level: int
    files: List["ResearchObjectivesFile"] = Relationship(
        back_populates="research_objectives"
    )


class ResearchObjectivesFile(SQLModel, table=True):
    __tablename__ = "research_objectives_file"
    id: str = Field(default_factory=generate_id, primary_key=True)
    research_objectives_id: str = Field(
        foreign_key="research_objectives.id"
    )
    filename: str
    original_name: str
    content_type: Optional[str] = None
    size: Optional[int] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

    research_objectives: ResearchObjectives = Relationship(
        back_populates="files"
    )
