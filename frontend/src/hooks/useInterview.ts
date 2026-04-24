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

  // Added from JS version — used by useQualReportStatus / usePrepareQualReport
  reportStatus: (workspaceId?: string, explorationId?: string) =>
    [
      ...interviewKeys.details(),
      { workspaceId, explorationId },
      'report-status',
    ] as const,
};

// ── Internal helper ───────────────────────────────────────────────────────────

function _triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch the most recent existing interview for a specific persona.
 * Returns null (not an error) when no interview exists yet.
 * Used to restore an existing interview instead of re-generating via LLM.
 */
export const useInterviewByPersona = (
  workspaceId?: string,
  explorationId?: string,
  personaId?: string
) => {
  return useQuery<Interview | null>({
    queryKey: [
      ...interviewKeys.details(),
      { workspaceId, explorationId, personaId },
      'by-persona',
    ],
    queryFn: () =>
      interviewService.getInterviewByPersona(
        workspaceId,
        explorationId,
        personaId
      ),
    enabled: !!workspaceId && !!explorationId && !!personaId,
    staleTime: 30_000, // 30s — short enough to pick up a just-created interview
    retry: false,      // service already swallows 404s
  });
};

// Start Interview
export const useStartInterview = (
  workspaceId?: string,
  explorationId?: string
) => {
  const queryClient = useQueryClient();

  return useMutation<Interview, Error, string>({
    mutationFn: (personaId: string) =>
      interviewService.startInterview(workspaceId, explorationId, personaId),

    onSuccess: (newInterview, personaId) => {
      // Invalidate interviews list
      queryClient.invalidateQueries({
        queryKey: interviewKeys.list(workspaceId, explorationId),
      });
      // Seed the by-persona cache so re-navigation within the staleTime window
      // restores the interview instantly without a round-trip to the server.
      queryClient.setQueryData(
        [
          ...interviewKeys.details(),
          { workspaceId, explorationId, personaId },
          'by-persona',
        ],
        newInterview
      );
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
      interviewService.getInterview(workspaceId, explorationId, interviewId),
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
    queryKey: interviewKeys.insights(workspaceId, explorationId, interviewId),
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
      interviewService.deleteInterview(workspaceId, explorationId, interviewId),

    onSuccess: (_, interviewId) => {
      queryClient.removeQueries({
        queryKey: interviewKeys.detail(workspaceId, explorationId, interviewId),
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
      _triggerBlobDownload(
        blob,
        `interview-report-${personaName || interviewId}.pdf`
      );
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
      interviewService.getAllInterviewPreview(workspaceId, explorationId),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

// Export all interviews
export const useExportAllInterviewsPdf = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useMutation<Blob, Error, void>({
    mutationFn: () =>
      interviewService.exportAllInterviewsPdf(workspaceId, explorationId),

    onSuccess: (blob) => {
      _triggerBlobDownload(blob, `all-interviews-report.pdf`);
    },
  });
};

// Download qualitative transcripts (.docx)
export const useDownloadQualTranscripts = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useMutation<Blob, Error, void>({
    mutationFn: () =>
      interviewService.downloadQualTranscripts(workspaceId, explorationId),
    onSuccess: (blob) =>
      _triggerBlobDownload(blob, `transcripts_${explorationId}.docx`),
  });
};

// Download qualitative decision intelligence report (.pdf)
export const useDownloadQualDecisionIntelligence = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useMutation<Blob, Error, void>({
    mutationFn: () =>
      interviewService.downloadQualDecisionIntelligence(workspaceId, explorationId),
    onSuccess: (blob) =>
      _triggerBlobDownload(blob, `decision_intelligence_${explorationId}.pdf`),
  });
};

// Download qualitative behavior archaeology report (.pdf)
export const useDownloadQualBehaviorArchaeology = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useMutation<Blob, Error, void>({
    mutationFn: () =>
      interviewService.downloadQualBehaviorArchaeology(workspaceId, explorationId),
    onSuccess: (blob) =>
      _triggerBlobDownload(blob, `behavior_archaeology_${explorationId}.pdf`),
  });
};

// Download all combined qual reports (.pdf)
export const useDownloadQualAllCombined = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useMutation<Blob, Error, void>({
    mutationFn: () =>
      interviewService.downloadQualAllCombined(workspaceId, explorationId),
    onSuccess: (blob) =>
      _triggerBlobDownload(blob, `all_combined_report_${explorationId}.pdf`),
  });
};

// Poll qual report generation status
export const useQualReportStatus = (
  workspaceId?: string,
  explorationId?: string,
  options = {}
) => {
  return useQuery<unknown>({
    queryKey: interviewKeys.reportStatus(workspaceId, explorationId),
    queryFn: () =>
      interviewService.getQualReportStatus(workspaceId, explorationId),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

// Trigger qual report preparation for a given report slug
export const usePrepareQualReport = (
  workspaceId?: string,
  explorationId?: string
) => {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string>({
    mutationFn: (reportSlug: string) =>
      interviewService.prepareQualReport(workspaceId, explorationId, reportSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewKeys.reportStatus(workspaceId, explorationId),
      });
    },
  });
};