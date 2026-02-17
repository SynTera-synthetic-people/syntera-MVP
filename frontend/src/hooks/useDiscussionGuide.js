// hooks/useDiscussionGuide.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discussionGuideService } from '../services/discussionGuideService';

// Keys for queries
export const discussionGuideKeys = {
  all: ['discussion-guide'],
  lists: () => [...discussionGuideKeys.all, 'list'],
  list: (workspaceId, explorationId) =>
    [...discussionGuideKeys.lists(), { workspaceId, explorationId }],
  details: () => [...discussionGuideKeys.all, 'detail'],
  detail: (workspaceId, explorationId, sectionId) =>
    [...discussionGuideKeys.details(), { workspaceId, explorationId, sectionId }],
  generated: (workspaceId, explorationId) =>
    [...discussionGuideKeys.all, 'generated', { workspaceId, explorationId }],
};

// Custom hooks
export const useDiscussionGuide = (workspaceId, explorationId, options = {}) => {
  return useQuery({
    queryKey: discussionGuideKeys.list(workspaceId, explorationId),
    queryFn: () => discussionGuideService.getAllSections(workspaceId, explorationId),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

export const useGenerateDiscussionGuide = (workspaceId, explorationId, options = {}) => {
  return useMutation({
    mutationFn: () => discussionGuideService.generateGuide(workspaceId, explorationId),
    ...options,
  });
};

// New hook that handles the logic: get existing data, if empty, generate new
export const useDiscussionGuideWithAutoGenerate = (workspaceId, explorationId, options = {}) => {
  const queryClient = useQueryClient();

  const {
    data: guideData,
    isLoading: isGuideLoading,
    error: guideError,
    refetch: refetchGuide
  } = useDiscussionGuide(workspaceId, explorationId, options);

  const generateMutation = useGenerateDiscussionGuide(workspaceId, explorationId, {
    onSuccess: (newData) => {
      // Invalidate the guide query to refetch with new data
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });

  // Check if we need to auto-generate
  const shouldAutoGenerate = guideData?.data?.sections?.length === 0 && !generateMutation.isPending;

  return {
    data: guideData,
    isLoading: isGuideLoading,
    error: guideError,
    refetch: refetchGuide,
    generateGuide: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    generationError: generateMutation.error,
    shouldAutoGenerate,
  };
};

// Rest of your hooks remain the same...
export const useCreateSection = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => discussionGuideService.createSection(workspaceId, explorationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useUpdateSection = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, ...data }) => discussionGuideService.updateSection(workspaceId, explorationId, sectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useDeleteSection = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, data }) => discussionGuideService.deleteSection(workspaceId, explorationId, sectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useCreateQuestion = (workspaceId, explorationId, sectionId) => {
  console.log("sectionId hook=> ", sectionId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, ...rest }) => discussionGuideService.createQuestion(workspaceId, explorationId, sectionId, rest),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useUpdateQuestion = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ questionId, data }) => discussionGuideService.updateQuestion(workspaceId, explorationId, questionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useDeleteQuestion = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ questionId, data }) => discussionGuideService.deleteQuestion(workspaceId, explorationId, questionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};