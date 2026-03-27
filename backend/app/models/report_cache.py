from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ReportCache(SQLModel, table=True):
    __tablename__ = "report_cache"

    id: str = Field(primary_key=True)
    exploration_id: str = Field(index=True)
    simulation_id: Optional[str] = Field(default=None, index=True)  # None for qual
    report_type: str  # "qual" | "quant"
    cta_type: str = Field(index=True)  # "TRANSCRIPTS" | "DECISION_INTELLIGENCE" | "BEHAVIORAL_ARCHAEOLOGY" | "CSV_DATA"
    status: str = Field(default="done")  # "done" | "failed"
    pdf_path: Optional[str] = Field(default=None)
    content_md: Optional[str] = Field(default=None)
    error_message: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = Field(default=None)
