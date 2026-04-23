import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { interviewService } from '../services/interviewService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Interview {
  id: string;
  personaId: string;
  messages?: unknown[];
  insights?: unknown;
  [key: string]: unknown;
}

export interface MessagePayload {
  content: string;
  role?: string;
}

export interface ExportInterviewPayload {
  interviewId: string;
  personaName?: string;
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const interviewKeys = {
  all: ['interviews'] as const,

  lists: () => [...interviewKeys.all, 'list'] as const,

  list: (workspaceId?: string, explorationId?: string) =>
    [...interviewKeys.lists(), { workspaceId, explorationId }] as const,

  details: () => [...interviewKeys.all, 'detail'] as const,

  detail: (
    workspaceId?: string,
    explorationId?: string,
    interviewId?: string
  ) =>
    [
      ...interviewKeys.details(),
      { workspaceId, explorationId, interviewId },
    ] as const,

  messages: (
    workspaceId?: string,
    explorationId?: string,
    interviewId?: string
  ) =>
    [
      ...interviewKeys.details(),
      { workspaceId, explorationId, interviewId },
      'messages',
    ] as const,

  insights: (
    workspaceId?: string,
    explorationId?: string,
    interviewId?: string
  ) =>
    [
      ...interviewKeys.details(),
      { workspaceId, explorationId, interviewId },
      'insights',
    ] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

// Start Interview
export const useStartInterview = (
  workspaceId?: string,
  explorationId?: string
) => {
  const queryClient = useQueryClient();

  return useMutation<Interview, Error, string>({
    mutationFn: (personaId: string) =>
      interviewService.startInterview(workspaceId, explorationId, personaId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewKeys.list(workspaceId, explorationId),
      });
    },
  });
};

// Get single interview
export const useInterview = (
  workspaceId?: string,
  explorationId?: string,
  interviewId?: string,
  options = {}
) => {
  return useQuery<Interview>({
    queryKey: interviewKeys.detail(workspaceId, explorationId, interviewId),
    queryFn: () =>
      interviewService.getInterview(
        workspaceId,
        explorationId,
        interviewId
      ),
    enabled: !!(workspaceId && explorationId && interviewId),
    ...options,
  });
};

// Get all interviews
export const useInterviews = (
  workspaceId?: string,
  explorationId?: string,
  options = {}
) => {
  return useQuery<Interview[]>({
    queryKey: interviewKeys.list(workspaceId, explorationId),
    queryFn: () =>
      interviewService.getInterviews(workspaceId, explorationId),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

// Send message
export const useSendMessage = (
  workspaceId?: string,
  explorationId?: string,
  interviewId?: string
) => {
  const queryClient = useQueryClient();

  return useMutation<Interview, Error, MessagePayload>({
    mutationFn: (message: MessagePayload) =>
      interviewService.sendMessage(
        workspaceId,
        explorationId,
        interviewId,
        message
      ),

    onSuccess: (updatedInterview) => {
      queryClient.setQueryData(
        interviewKeys.detail(workspaceId, explorationId, interviewId),
        updatedInterview
      );
    },
  });
};

// Interview insights
export const useInterviewInsights = (
  workspaceId?: string,
  explorationId?: string,
  interviewId?: string,
  options = {}
) => {
  return useQuery<unknown>({
    queryKey: interviewKeys.insights(
      workspaceId,
      explorationId,
      interviewId
    ),
    queryFn: () =>
      interviewService.getInterviewInsights(
        workspaceId,
        explorationId,
        interviewId
      ),
    enabled: !!(workspaceId && explorationId && interviewId),
    ...options,
  });
};

// Delete interview
export const useDeleteInterview = (
  workspaceId?: string,
  explorationId?: string
) => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (interviewId: string) =>
      interviewService.deleteInterview(
        workspaceId,
        explorationId,
        interviewId
      ),

    onSuccess: (_, interviewId) => {
      queryClient.removeQueries({
        queryKey: interviewKeys.detail(
          workspaceId,
          explorationId,
          interviewId
        ),
      });

      queryClient.invalidateQueries({
        queryKey: interviewKeys.list(workspaceId, explorationId),
      });
    },
  });
};

// Export single interview PDF
export const useExportInterviewReport = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useMutation<Blob, Error, ExportInterviewPayload>({
    mutationFn: ({ interviewId }) =>
      interviewService.exportInterviewReport(
        workspaceId,
        explorationId,
        interviewId
      ),

    onSuccess: (blob, { interviewId, personaName }) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = `interview-report-${
        personaName || interviewId
      }.pdf`;

      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
};

// Interview preview
export const useInterviewPreview = (
  workspaceId?: string,
  explorationId?: string,
  interviewId?: string,
  options = {}
) => {
  return useQuery<unknown>({
    queryKey: [
      ...interviewKeys.details(),
      { workspaceId, explorationId, interviewId },
      'preview',
    ],
    queryFn: () =>
      interviewService.getInterviewPreview(
        workspaceId,
        explorationId,
        interviewId
      ),
    enabled: !!(workspaceId && explorationId && interviewId),
    ...options,
  });
};

// All previews
export const useAllInterviewPreview = (
  workspaceId?: string,
  explorationId?: string,
  options = {}
) => {
  return useQuery<unknown[]>({
    queryKey: [
      ...interviewKeys.details(),
      { workspaceId, explorationId },
      'preview',
    ],
    queryFn: () =>
      interviewService.getAllInterviewPreview(
        workspaceId,
        explorationId
      ),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

// Export all interviews
export const useExportAllInterviewsPdf = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useMutation<Blob>({
    mutationFn: () =>
      interviewService.exportAllInterviewsPdf(
        workspaceId,
        explorationId
      ),

    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = `all-interviews-report.pdf`;

      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
};