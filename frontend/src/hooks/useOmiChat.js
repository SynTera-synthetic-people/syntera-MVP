import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createResearchObjective,
  initializeOmiSession,
  sendMessageToOmi,
  getConversationHistory
} from '../services/researchObjectiveService';

// Query keys
export const omiKeys = {
  all: ['research_objective'],
  session: (explorationId) => [...omiKeys.all, 'session', explorationId],
  chat: (explorationId) => [...omiKeys.all, 'chat', explorationId],
  conversation: (workspaceId, explorationId) => [...omiKeys.all, 'conversation', workspaceId, explorationId],
};

// Hook to initialize Omi session
export const useInitializeOmiSession = (explorationId) => {
  return useQuery({
    queryKey: omiKeys.session(explorationId),
    queryFn: () => initializeOmiSession(explorationId),
    enabled: !!explorationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
};

// Hook to get conversation history
export const useConversationHistory = (workspaceId, explorationId) => {
  return useQuery({
    queryKey: omiKeys.conversation(workspaceId, explorationId),
    queryFn: () => getConversationHistory(workspaceId, explorationId),
    enabled: !!(workspaceId && explorationId),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
    retry: 1,
    onError: (error) => {
      console.error('Error fetching conversation history:', error);
    }
  });
};

// Hook to send message to Omi
export const useSendMessageToOmi = (explorationId, sessionId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (message) => sendMessageToOmi(explorationId, sessionId, message),
    onMutate: async (newMessage) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: omiKeys.chat(explorationId) });

      // Return context with the optimistic message
      return { newMessage };
    },
    onSuccess: (data, variables, context) => {
      // Invalidate conversation history to refetch
      queryClient.invalidateQueries({
        queryKey: omiKeys.all
      });

      // Also invalidate specific conversation query
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.includes('conversation')
      });
    },
    onError: (error, variables, context) => {
      console.error('Failed to send message:', error);
    },
  });
};

// Hook to create research objective
export const useCreateResearchObjective = () => {
  const mutation = useMutation({
    mutationFn: (explorationId) => createResearchObjective(explorationId),
    onSuccess: (data) => {
      console.log('Research Objective creation API called successfully:', data);
    },
    onError: (error) => {
      console.error('Error calling research objective creation API:', error);
    }
  });

  return mutation;
};