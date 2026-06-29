import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createResearchObjective,
  createResearchObjectiveFromFramer,
  submitFramerMaterialSection,
  initializeOmiSession,
  sendMessageToOmi,
  getConversationHistory,
  patchResearchObjectiveSummary,
  patchOmiMessageContent,
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

// Hook to update a single Omi message's content in DB (keeps chat history in sync after inline edits)
export const usePatchOmiMessageContent = () => {
  return useMutation({
    mutationFn: ({ messageId, content }) => patchOmiMessageContent(messageId, content),
    onError: (error) => {
      console.error('Failed to update Omi message content:', error);
    },
  });
};

// Hook to persist inline summary edits — fire-and-forget, no downstream cache invalidation
export const usePatchResearchObjectiveSummary = (workspaceId, explorationId) => {
  return useMutation({
    mutationFn: (description) =>
      patchResearchObjectiveSummary(workspaceId, explorationId, description),
    onError: (error) => {
      console.error('Failed to persist summary edit:', error);
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

// Hook to save the Research Objective Framer's structured fields. The backend
// writes the same Omi confirmation message the chat flow produces, so refetching
// conversation history afterward is enough for the existing CTA gating to work.
export const useCreateResearchObjectiveFromFramer = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (framerPayload) =>
      createResearchObjectiveFromFramer(workspaceId, explorationId, framerPayload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: omiKeys.all });
    },
    onError: (error) => {
      console.error('Error saving research objective from Framer:', error);
    },
  });
};

// Hook to submit one Framer "Add Material" section (Research Brief / Artifact).
// The request only resolves once the backend has extracted/fetched + summarized
// everything in the section, so isPending here IS the real "processing" state.
export const useSubmitFramerMaterialSection = (workspaceId, explorationId) => {
  return useMutation({
    mutationFn: (section) =>
      submitFramerMaterialSection(workspaceId, explorationId, section),
    onError: (error) => {
      console.error('Error submitting Framer material section:', error);
    },
  });
};