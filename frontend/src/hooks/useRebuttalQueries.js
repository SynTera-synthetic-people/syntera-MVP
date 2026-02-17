import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rebuttalApi } from '../services/rebuttalService';

export const useRebuttalQuestions = (workspaceId, explorationId, data, enabled = true) => {
  return useQuery({
    queryKey: ['rebuttal-questions', workspaceId, explorationId],
    queryFn: () => rebuttalApi.getQuestions(workspaceId, explorationId, data).then(res => res.data),
    enabled: enabled && !!workspaceId && !!explorationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};

export const useStartRebuttal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, explorationId, data }) =>
      rebuttalApi.startRebuttal(workspaceId, explorationId, data).then(res => res.data),
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries(['rebuttal-session', variables.workspaceId, variables.explorationId]);
    },
  });
};

export const useSendReply = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, explorationId, data }) =>
      rebuttalApi.sendReply(workspaceId, explorationId, data).then(res => res.data),
    onSuccess: (data, variables) => {
      // Update session cache
      queryClient.invalidateQueries(['rebuttal-session', variables.workspaceId, variables.explorationId, variables.data.session_id]);
    },
  });
};

export const useRebuttalSession = (workspaceId, explorationId, sessionId, enabled = true) => {
  return useQuery({
    queryKey: ['rebuttal-session', workspaceId, explorationId, sessionId],
    queryFn: () => rebuttalApi.getSession(workspaceId, explorationId, sessionId).then(res => res.data),
    enabled: enabled && !!workspaceId && !!explorationId && !!sessionId,
    refetchOnWindowFocus: false,
    retry: 2,
  });
};

export const useRebuttalSessions = (workspaceId, explorationId, enabled = true) => {
  return useQuery({
    queryKey: ['rebuttal-sessions', workspaceId, explorationId],
    queryFn: () => rebuttalApi.getSessions(workspaceId, explorationId).then(res => res.data),
    enabled: enabled && !!workspaceId && !!explorationId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 2,
  });
};