// hooks/useDataPlaygroundQueries.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  uploadDataset,
  listDatasets,
  getDatasetVariables,
  getDatasetRows,
  runFrequency,
  runCrosstab,
  runChart,
  runInsights,
} from '../services/dataPlaygroundService';

interface Scope {
  workspaceId?: string;
  explorationId?: string;
}

const datasetsQueryKey = (workspaceId?: string, explorationId?: string) => [
  'dataPlayground', 'datasets', workspaceId, explorationId,
];

const variablesQueryKey = (workspaceId?: string, explorationId?: string, datasetId?: string | null) => [
  'dataPlayground', 'variables', workspaceId, explorationId, datasetId,
];

const rowsQueryKey = (
  workspaceId?: string, explorationId?: string, datasetId?: string | null,
  mode?: string, page?: number,
) => ['dataPlayground', 'rows', workspaceId, explorationId, datasetId, mode, page];

const insightsQueryKey = (workspaceId?: string, explorationId?: string, datasetId?: string | null) => [
  'dataPlayground', 'insights', workspaceId, explorationId, datasetId,
];

// ── Datasets ─────────────────────────────────────────────────────────────

export const useDatasetsList = (workspaceId?: string, explorationId?: string) => {
  return useQuery({
    queryKey: datasetsQueryKey(workspaceId, explorationId),
    queryFn: () => listDatasets({ workspaceId: workspaceId!, explorationId: explorationId! }),
    enabled: !!workspaceId && !!explorationId,
  });
};

export const useDatasetVariables = (
  workspaceId?: string,
  explorationId?: string,
  datasetId?: string | null,
) => {
  return useQuery({
    queryKey: variablesQueryKey(workspaceId, explorationId, datasetId),
    queryFn: () =>
      getDatasetVariables({
        workspaceId: workspaceId!,
        explorationId: explorationId!,
        datasetId: datasetId!,
      }),
    enabled: !!workspaceId && !!explorationId && !!datasetId,
    staleTime: 60_000,
  });
};

export const useUploadDataset = (workspaceId?: string, explorationId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) =>
      uploadDataset({ workspaceId: workspaceId!, explorationId: explorationId!, file }),

    onSuccess: (dataset) => {
      queryClient.invalidateQueries({ queryKey: datasetsQueryKey(workspaceId, explorationId) });
      queryClient.setQueryData(
        variablesQueryKey(workspaceId, explorationId, dataset.dataset_id),
        dataset.variables,
      );
    },
  });
};

export const useDatasetRows = (
  workspaceId: string | undefined,
  explorationId: string | undefined,
  datasetId: string | null | undefined,
  mode: 'coded' | 'labelled',
  page: number,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: rowsQueryKey(workspaceId, explorationId, datasetId, mode, page),
    queryFn: () =>
      getDatasetRows({
        workspaceId: workspaceId!,
        explorationId: explorationId!,
        datasetId: datasetId!,
        mode,
        page,
      }),
    enabled: enabled && !!workspaceId && !!explorationId && !!datasetId,
    staleTime: 60_000,
    placeholderData: (previous) => previous, // keep showing the old page while the next one loads
  });
};

// ── Analyses ─────────────────────────────────────────────────────────────
// Frequency/Crosstab/Chart are triggered imperatively by an explicit "Run"
// action in the UI, so they're modeled as mutations rather than queries —
// the backend already caches identical requests (dp_analysis), so a mutation
// re-fires the network call but never recomputes server-side.

export const useRunFrequency = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      datasetId,
      variables,
    }: Scope & { datasetId: string; variables: string[] }) =>
      runFrequency({
        workspaceId: workspaceId!,
        explorationId: explorationId!,
        datasetId,
        variables,
      }),
  });
};

export const useRunCrosstab = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      datasetId,
      bannerVariables,
      mainVariables,
    }: Scope & { datasetId: string; bannerVariables: string[]; mainVariables: string[] }) =>
      runCrosstab({
        workspaceId: workspaceId!,
        explorationId: explorationId!,
        datasetId,
        bannerVariables,
        mainVariables,
      }),
  });
};

export const useRunChart = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      datasetId,
      variables,
      chartType,
      breakdownVariable,
    }: Scope & {
      datasetId: string;
      variables: string[];
      chartType: string;
      breakdownVariable?: string | null;
    }) =>
      runChart({
        workspaceId: workspaceId!,
        explorationId: explorationId!,
        datasetId,
        variables,
        chartType,
        breakdownVariable,
      }),
  });
};

// Insights has no user-chosen parameters (whole-dataset summary) and loads
// automatically when the tab opens, so it's a query rather than a mutation.
export const useRunInsights = (
  workspaceId: string | undefined,
  explorationId: string | undefined,
  datasetId: string | null | undefined,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: insightsQueryKey(workspaceId, explorationId, datasetId),
    queryFn: () =>
      runInsights({ workspaceId: workspaceId!, explorationId: explorationId!, datasetId: datasetId! }),
    enabled: enabled && !!workspaceId && !!explorationId && !!datasetId,
    staleTime: 60_000,
  });
};
