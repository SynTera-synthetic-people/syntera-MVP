// hooks/useInterview.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { interviewService } from '../services/interviewService';

// Keys for queries
export const interviewKeys = {
  all: ['interviews'],
  lists: () => [...interviewKeys.all, 'list'],
  list: (workspaceId, explorationId) =>
    [...interviewKeys.lists(), { workspaceId, explorationId }],
  details: () => [...interviewKeys.all, 'detail'],
  detail: (workspaceId, explorationId, interviewId) =>
    [...interviewKeys.details(), { workspaceId, explorationId, interviewId }],
  messages: (workspaceId, explorationId, interviewId) =>
    [...interviewKeys.details(), { workspaceId, explorationId, interviewId }, 'messages'],
  insights: (workspaceId, explorationId, interviewId) =>
    [...interviewKeys.details(), { workspaceId, explorationId, interviewId }, 'insights'],
  reportStatus: (workspaceId, explorationId) =>
    [...interviewKeys.details(), { workspaceId, explorationId }, 'report-status'],
};

// Custom hooks
export const useStartInterview = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personaId) => interviewService.startInterview(workspaceId, explorationId, personaId),
    onSuccess: (newInterview) => {
      // Invalidate interviews list
      queryClient.invalidateQueries({
        queryKey: interviewKeys.list(workspaceId, explorationId),
      });
      return newInterview;
    },
  });
};

export const useInterview = (workspaceId, explorationId, interviewId, options = {}) => {
  return useQuery({
    queryKey: interviewKeys.detail(workspaceId, explorationId, interviewId),
    queryFn: () => interviewService.getInterview(workspaceId, explorationId, interviewId),
    enabled: !!(workspaceId && explorationId && interviewId),
    ...options,
  });
};

export const useInterviews = (workspaceId, explorationId, options = {}) => {
  return useQuery({
    queryKey: interviewKeys.list(workspaceId, explorationId),
    queryFn: () => interviewService.getInterviews(workspaceId, explorationId),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

export const useSendMessage = (workspaceId, explorationId, interviewId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (message) => interviewService.sendMessage(workspaceId, explorationId, interviewId, message),
    onSuccess: (updatedInterview) => {
      // Update the interview data with new messages
      queryClient.setQueryData(
        interviewKeys.detail(workspaceId, explorationId, interviewId),
        updatedInterview
      );
    },
  });
};

export const useInterviewInsights = (workspaceId, explorationId, interviewId, options = {}) => {
  return useQuery({
    queryKey: interviewKeys.insights(workspaceId, explorationId, interviewId),
    queryFn: () => interviewService.getInterviewInsights(workspaceId, explorationId, interviewId),
    enabled: !!(workspaceId && explorationId && interviewId),
    ...options,
  });
};

export const useDeleteInterview = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (interviewId) => interviewService.deleteInterview(workspaceId, explorationId, interviewId),
    onSuccess: (_, interviewId) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: interviewKeys.detail(workspaceId, explorationId, interviewId),
      });
      queryClient.invalidateQueries({
        queryKey: interviewKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useExportInterviewReport = (workspaceId, explorationId) => {
  return useMutation({
    mutationFn: ({ interviewId }) =>
      interviewService.exportInterviewReport(workspaceId, explorationId, interviewId),
    onSuccess: (blob, { interviewId, personaName }) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interview-report-${personaName || interviewId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
};

export const useInterviewPreview = (workspaceId, explorationId, interviewId, options = {}) => {
  return useQuery({
    queryKey: [...interviewKeys.details(), { workspaceId, explorationId, interviewId }, 'preview'],
    queryFn: () => interviewService.getInterviewPreview(workspaceId, explorationId, interviewId),
    enabled: !!(workspaceId && explorationId && interviewId),
    ...options,
  });
};

export const useAllInterviewPreview = (workspaceId, explorationId, options = {}) => {
  return useQuery({
    queryKey: [...interviewKeys.details(), { workspaceId, explorationId }, 'preview'],
    queryFn: () => interviewService.getAllInterviewPreview(workspaceId, explorationId),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

export const useExportAllInterviewsPdf = (workspaceId, explorationId) => {
  return useMutation({
    mutationFn: () =>
      interviewService.exportAllInterviewsPdf(workspaceId, explorationId),
    onSuccess: (blob) => {
      // Create download link
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

function _triggerBlobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export const useDownloadQualTranscripts = (workspaceId, explorationId) => {
  return useMutation({
    mutationFn: () => interviewService.downloadQualTranscripts(workspaceId, explorationId),
    onSuccess: (blob) => _triggerBlobDownload(blob, `transcripts_${explorationId}.docx`),
  });
};

export const useDownloadQualDecisionIntelligence = (workspaceId, explorationId) => {
  return useMutation({
    mutationFn: () => interviewService.downloadQualDecisionIntelligence(workspaceId, explorationId),
    onSuccess: (blob) => _triggerBlobDownload(blob, `decision_intelligence_${explorationId}.pdf`),
  });
};

export const useDownloadQualBehaviorArchaeology = (workspaceId, explorationId) => {
  return useMutation({
    mutationFn: () => interviewService.downloadQualBehaviorArchaeology(workspaceId, explorationId),
    onSuccess: (blob) => _triggerBlobDownload(blob, `behavior_archaeology_${explorationId}.pdf`),
  });
};

export const useDownloadQualAllCombined = (workspaceId, explorationId) => {
  return useMutation({
    mutationFn: () => interviewService.downloadQualAllCombined(workspaceId, explorationId),
    onSuccess: (blob) => _triggerBlobDownload(blob, `all_combined_report_${explorationId}.pdf`),
  });
};

export const useQualReportStatus = (workspaceId, explorationId, options = {}) => {
  return useQuery({
    queryKey: interviewKeys.reportStatus(workspaceId, explorationId),
    queryFn: () => interviewService.getQualReportStatus(workspaceId, explorationId),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

export const usePrepareQualReport = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reportSlug) => interviewService.prepareQualReport(workspaceId, explorationId, reportSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: interviewKeys.reportStatus(workspaceId, explorationId),
      });
    },
  });
};
