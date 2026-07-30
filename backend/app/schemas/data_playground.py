from typing import Any, Optional
from datetime import datetime
from pydantic import BaseModel


class VariableOut(BaseModel):
    id: str
    variable_name: str
    display_name: str
    data_type: str
    position: int
    unique_values_count: int
    missing_count: int
    value_labels: Optional[list[dict[str, Any]]] = None

    class Config:
        from_attributes = True


class DatasetOut(BaseModel):
    dataset_id: str
    name: str
    original_filename: str
    file_type: str
    status: str
    rows: int
    columns: int
    created_at: Optional[datetime] = None


class DatasetUploadOut(DatasetOut):
    variables: list[VariableOut] = []


class DatasetFromSurveyRequest(BaseModel):
    simulation_id: str


class VariablesListOut(BaseModel):
    dataset_id: str
    variables: list[VariableOut]


class FrequencyRequest(BaseModel):
    variables: list[str]


class FrequencyRowOut(BaseModel):
    label: str
    frequency: int
    percent: float
    valid_percent: float
    cumulative_percent: float


class FrequencyResultOut(BaseModel):
    variable: str
    title: str
    base: int
    missing: int
    rows: list[FrequencyRowOut]


class FrequencyResponseOut(BaseModel):
    results: list[FrequencyResultOut]


class CrosstabRequest(BaseModel):
    banner_variables: list[str]
    main_variables: list[str]


class CrosstabColumnOut(BaseModel):
    banner_variable: Optional[str] = None  # None for the leading "Total" column
    label: str


class CrosstabBaseOut(BaseModel):
    total: int
    by_column: list[int]


class CrosstabCellOut(BaseModel):
    count: int
    col_pct: float
    row_pct: float


class CrosstabRowTotalOut(BaseModel):
    count: int
    pct: float


class CrosstabRowOut(BaseModel):
    code: Optional[int] = None
    label: str
    total: CrosstabRowTotalOut
    cells: list[CrosstabCellOut]


class CrosstabTableOut(BaseModel):
    main_variable: str
    title: str
    banner_title: str
    columns: list[CrosstabColumnOut]
    base: CrosstabBaseOut
    rows: list[CrosstabRowOut]


class CrosstabResponseOut(BaseModel):
    tables: list[CrosstabTableOut]


class ChartRequest(BaseModel):
    variables: list[str]
    chart_type: str
    breakdown_variable: Optional[str] = None


class ChartSeriesOut(BaseModel):
    name: str
    values: list[int]
    percentages: list[float]


class ChartResponseOut(BaseModel):
    chart_type: str
    labels: list[str]
    series: list[ChartSeriesOut]
    base: int


class InsightsResponseOut(BaseModel):
    title: str
    summary: str
    key_patterns: list[str]
    anomalies: list[str]


class DatasetColumnOut(BaseModel):
    key: str
    header: str
    type: str


class DatasetCellOut(BaseModel):
    code: Optional[int] = None
    label: str


class DatasetRowOut(BaseModel):
    respid: str
    values: dict[str, DatasetCellOut]


class DatasetRowsPageOut(BaseModel):
    columns: list[DatasetColumnOut]
    rows: list[DatasetRowOut]
    page: int
    page_size: int
    total_rows: int
