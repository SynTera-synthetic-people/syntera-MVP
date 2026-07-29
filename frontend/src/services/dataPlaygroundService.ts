// services/dataPlaygroundService.ts
//
// Thin axios wrapper around the Data Playground backend
// (/workspaces/{workspace_id}/explorations/{exploration_id}/data-playground/...).
// Every call unwraps the SuccessResponse envelope ({status, message, data})
// down to `data`, so callers/hooks work with plain typed payloads.

import axiosInstance from '../utils/axiosConfig';

// ── Types (mirror backend/app/schemas/data_playground.py) ──────────────────

export interface DatasetVariable {
  id: string;
  variable_name: string;
  display_name: string;
  data_type: string;
  position: number;
  unique_values_count: number;
  missing_count: number;
  value_labels: { code: number; label: string }[] | null;
}

export interface Dataset {
  dataset_id: string;
  name: string;
  original_filename: string;
  file_type: string;
  status: string;
  rows: number;
  columns: number;
  created_at: string | null;
}

export interface DatasetUpload extends Dataset {
  variables: DatasetVariable[];
}

export interface FrequencyRow {
  label: string;
  frequency: number;
  percent: number;
  valid_percent: number;
  cumulative_percent: number;
}

export interface FrequencyResult {
  variable: string;
  title: string;
  base: number;
  missing: number;
  rows: FrequencyRow[];
}

export interface CrosstabColumn {
  banner_variable: string | null; // null for the leading "Total" column
  label: string;
}

export interface CrosstabCell {
  count: number;
  col_pct: number;
  row_pct: number;
}

export interface CrosstabRow {
  code: number | null;
  label: string;
  total: { count: number; pct: number };
  cells: CrosstabCell[];
}

export interface CrosstabTable {
  main_variable: string;
  title: string;
  banner_title: string;
  columns: CrosstabColumn[];
  base: { total: number; by_column: number[] };
  rows: CrosstabRow[];
}

export interface ChartSeries {
  name: string;
  values: number[];
  percentages: number[];
}

export interface ChartResult {
  chart_type: string;
  labels: string[];
  series: ChartSeries[];
  base: number;
}

export interface InsightsResult {
  title: string;
  summary: string;
  key_patterns: string[];
  anomalies: string[];
}

export interface DatasetRowCell {
  code: number | null;
  label: string;
}

export interface DatasetRowsPage {
  columns: { key: string; header: string; type: string }[];
  rows: { respid: string; values: Record<string, DatasetRowCell> }[];
  page: number;
  page_size: number;
  total_rows: number;
}

interface ExplorationScope {
  workspaceId: string;
  explorationId: string;
}

/** Pulls the backend's ErrorResponse.message out of an axios error, with a
 * caller-supplied fallback for network errors / unexpected shapes. */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
}

const base = ({ workspaceId, explorationId }: ExplorationScope) =>
  `/workspaces/${workspaceId}/explorations/${explorationId}/data-playground`;

// ── Datasets ─────────────────────────────────────────────────────────────

export const uploadDataset = async ({
  workspaceId,
  explorationId,
  file,
}: ExplorationScope & { file: File }): Promise<DatasetUpload> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axiosInstance.post(
    `${base({ workspaceId, explorationId })}/datasets`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data;
};

export const listDatasets = async ({
  workspaceId,
  explorationId,
}: ExplorationScope): Promise<Dataset[]> => {
  const response = await axiosInstance.get(`${base({ workspaceId, explorationId })}/datasets`);
  return response.data.data;
};

export const getDatasetVariables = async ({
  workspaceId,
  explorationId,
  datasetId,
}: ExplorationScope & { datasetId: string }): Promise<DatasetVariable[]> => {
  const response = await axiosInstance.get(
    `${base({ workspaceId, explorationId })}/datasets/${datasetId}/variables`
  );
  return response.data.data.variables;
};

export const getDatasetRows = async ({
  workspaceId,
  explorationId,
  datasetId,
  mode,
  page = 1,
  pageSize = 100,
}: ExplorationScope & {
  datasetId: string;
  mode: 'coded' | 'labelled';
  page?: number;
  pageSize?: number;
}): Promise<DatasetRowsPage> => {
  const response = await axiosInstance.get(
    `${base({ workspaceId, explorationId })}/datasets/${datasetId}/rows`,
    { params: { mode, page, page_size: pageSize } }
  );
  return response.data.data;
};

// ── Analyses ─────────────────────────────────────────────────────────────

export const runFrequency = async ({
  workspaceId,
  explorationId,
  datasetId,
  variables,
}: ExplorationScope & { datasetId: string; variables: string[] }): Promise<FrequencyResult[]> => {
  const response = await axiosInstance.post(
    `${base({ workspaceId, explorationId })}/datasets/${datasetId}/frequency`,
    { variables }
  );
  return response.data.data.results;
};

export const runCrosstab = async ({
  workspaceId,
  explorationId,
  datasetId,
  bannerVariables,
  mainVariables,
}: ExplorationScope & {
  datasetId: string;
  bannerVariables: string[];
  mainVariables: string[];
}): Promise<CrosstabTable[]> => {
  const response = await axiosInstance.post(
    `${base({ workspaceId, explorationId })}/datasets/${datasetId}/crosstab`,
    { banner_variables: bannerVariables, main_variables: mainVariables }
  );
  return response.data.data.tables;
};

export const runChart = async ({
  workspaceId,
  explorationId,
  datasetId,
  variables,
  chartType,
  breakdownVariable,
}: ExplorationScope & {
  datasetId: string;
  variables: string[];
  chartType: string;
  breakdownVariable?: string | null;
}): Promise<ChartResult> => {
  const response = await axiosInstance.post(
    `${base({ workspaceId, explorationId })}/datasets/${datasetId}/chart`,
    { variables, chart_type: chartType, breakdown_variable: breakdownVariable ?? null }
  );
  return response.data.data;
};

export const runInsights = async ({
  workspaceId,
  explorationId,
  datasetId,
}: ExplorationScope & { datasetId: string }): Promise<InsightsResult> => {
  const response = await axiosInstance.post(
    `${base({ workspaceId, explorationId })}/datasets/${datasetId}/insights`
  );
  return response.data.data;
};
