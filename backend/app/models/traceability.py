from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSON
from typing import Dict, Optional
from datetime import datetime
from app.utils.id_generator import generate_id

class TraceabilityRecord(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)

    workspace_id: str = Field(foreign_key="workspace.id")
    exploration_id: str = Field(foreign_key="explorations.id")

    foundation_layer: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    generation_process: Dict = Field(sa_column=Column(JSON), default_factory=dict)
    validation_layer: Dict = Field(sa_column=Column(JSON), default_factory=dict)

    narrative_summary: Dict = Field(sa_column=Column(JSON), default_factory=dict)

    created_by: Optional[str] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TraceabilityReport(SQLModel, table=True):
    __tablename__ = "traceability_report"

    id: str = Field(default_factory=generate_id, primary_key=True)
    exploration_id: str = Field(index=True, unique=True, foreign_key="explorations.id")
    ro_traceability: dict = Field(sa_column=Column(JSON), default={})
    persona_traceability: dict = Field(sa_column=Column(JSON), default={})
    quant_traceability: dict = Field(sa_column=Column(JSON), default={})
    qual_traceability: dict = Field(sa_column=Column(JSON), default={})
    updated_at: datetime = Field(default_factory=datetime.utcnow)