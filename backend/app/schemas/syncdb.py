from pydantic import BaseModel
from typing import Any, Optional
from datetime import datetime


# ── Shared envelope (appears inside data/answers JSONB) ──────────────────────

class RecordEnvelope(BaseModel):
    """Standard envelope stored in every record's JSONB data field."""
    source_type: str
    domain: str
    workspace_id: Optional[str]
    region: Optional[str]
    year: Optional[int]
    source_file: str
    source_format: str          # "csv" | "excel"
    ingested_at: str            # ISO-8601 UTC
    status: str                 # "pending" | "processing" | "done" | "failed"
    payload: dict[str, Any]


# ── Action Data ───────────────────────────────────────────────────────────────

class ActionDatasetOut(BaseModel):
    id: str
    name: str
    domain: Optional[str]
    source_file: Optional[str]
    row_count: int
    columns: list
    exploration_id: Optional[str]
    uploaded_by: Optional[str]
    uploaded_at: datetime
    metadata: dict


class ActionRecordOut(BaseModel):
    id: str
    dataset_id: str
    row_index: int
    data: RecordEnvelope        # full envelope with payload inside
    status: str
    workspace_id: Optional[str]
    region: Optional[str]
    year: Optional[int]
    source_format: Optional[str]
    subject_key: Optional[str]  # SHA-256 of PII field; None if no PII detected
    created_at: datetime


class ActionRecordsPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ActionRecordOut]


# ── Survey Data ───────────────────────────────────────────────────────────────

class SurveyQuestionSchema(BaseModel):
    column: str
    text: str
    options: list[str]
    type: str   # "single_choice" | "multi_choice" | "open_text" | "demographic"


class SurveyDatasetOut(BaseModel):
    id: str
    name: str
    domain: Optional[str]
    source_file: Optional[str]
    respondent_count: int
    question_schema: list[SurveyQuestionSchema]
    exploration_id: Optional[str]
    uploaded_by: Optional[str]
    uploaded_at: datetime
    metadata: dict


class SurveyAggregationOut(BaseModel):
    dataset_id: str
    results: dict[str, list[dict[str, Any]]]
    computed_at: datetime


class LinkExplorationIn(BaseModel):
    exploration_id: str


# ── Source Bank ───────────────────────────────────────────────────────────────

class SourceDocumentOut(BaseModel):
    id: str
    title: str
    source_type: str
    source_url: Optional[str] = None
    file_name: Optional[str] = None
    domain: Optional[str] = None
    is_processed: bool
    exploration_id: Optional[str] = None
    uploaded_by: Optional[str] = None
    uploaded_at: datetime
    metadata: Optional[dict] = None  # columns + row_count for tabular docs


class SourceChunkOut(BaseModel):
    id: str
    document_id: str
    chunk_index: int
    content: Any
    content_json: Optional[dict] = None
    data_type: Optional[str] = None
    created_at: datetime


class SourceSearchResult(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    domain: Optional[str]
    data_type: Optional[str] = None
    chunk_index: int
    snippet: str


class SourceScrapeFailureOut(BaseModel):
    url: str
    reason: str


class SourceScrapeReportOut(BaseModel):
    total_attempted: int
    total_succeeded: int
    total_failed: int
    failed_urls: list[SourceScrapeFailureOut]
