from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSONB

from app.utils.id_generator import generate_id


class DataPlaygroundDataset(SQLModel, table=True):
    """A tabular file (CSV/XLSX) uploaded into the Data Playground.

    The original file on disk (uploads/data_playground/<stored_filename>) is the
    row-level source of truth; Postgres holds only the registry + metadata so
    the variables panel and dataset lists never need to touch the file.
    """
    __tablename__ = "dp_dataset"

    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(index=True)
    exploration_id: str = Field(index=True)
    name: str
    original_filename: str
    stored_filename: str
    file_type: str  # 'csv' | 'xlsx' | 'xls'
    row_count: int = Field(default=0)
    column_count: int = Field(default=0)
    status: str = Field(default="ready", index=True)  # 'processing' | 'ready' | 'failed'
    meta: Dict[str, Any] = Field(sa_column=Column(JSONB), default_factory=dict)
    created_by: Optional[str] = Field(default=None, index=True)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class DataPlaygroundVariable(SQLModel, table=True):
    """One column of a dataset, with inferred type and value-label map.

    value_labels holds [{"code": int, "label": str}] — codes come from a
    datamap sheet when one is detected, otherwise stable ordinals assigned at
    ingest. This is what powers the Coded Data / Labelled Data tabs.
    """
    __tablename__ = "dp_variable"

    id: str = Field(default_factory=generate_id, primary_key=True)
    # Indexed via the composite (dataset_id, position) index in startup.py.
    dataset_id: str
    variable_name: str  # normalized column name, e.g. "S2"
    display_name: str  # question text if known, else variable_name
    data_type: str  # 'categorical' | 'numeric' | 'open_text' | 'demographic' | 'identifier'
    position: int = Field(default=0)  # original column order
    unique_values_count: int = Field(default=0)
    missing_count: int = Field(default=0)
    value_labels: Optional[List[Dict[str, Any]]] = Field(sa_column=Column(JSONB), default=None)
    meta: Dict[str, Any] = Field(sa_column=Column(JSONB), default_factory=dict)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class DataPlaygroundAnalysis(SQLModel, table=True):
    """A computed analysis result (frequency/crosstab/chart/insights).

    parameters stores the exact request payload so an identical re-run can be
    served from here instead of re-reading the file.
    """
    __tablename__ = "dp_analysis"

    id: str = Field(default_factory=generate_id, primary_key=True)
    # Both indexed via the composite (dataset_id, analysis_type) index in startup.py.
    dataset_id: str
    analysis_type: str  # 'frequency' | 'crosstab' | 'chart' | 'insights'
    parameters: Dict[str, Any] = Field(sa_column=Column(JSONB), default_factory=dict)
    result: Dict[str, Any] = Field(sa_column=Column(JSONB), default_factory=dict)
    created_by: Optional[str] = Field(default=None)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
