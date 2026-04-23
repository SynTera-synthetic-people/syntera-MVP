import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discussionGuideService } from '../services/discussionGuideService';

/* ── Types ───────────────────────────────────────────────────────────── */

type Section = {
  section_id: string;
  title: string;
};

type GuideResponse = {
  data?: {
    sections?: Section[];
  };
};

type CreateSectionPayload = {
  title: string;
  is_force_insert?: boolean;
};

type UpdateSectionPayload = {
  sectionId: string;
  title: string;
  is_force_insert?: boolean;
};

type DeleteSectionPayload = {
  sectionId: string;
  data: { is_force_insert?: boolean };
};

type CreateQuestionPayload = {
  sectionId: string;
  text: string;
  is_force_insert?: boolean;
};

type UpdateQuestionPayload = {
  questionId: string;
  data: {
    text: string;
    is_force_insert?: boolean;
  };
};

type DeleteQuestionPayload = {
  questionId: string;
  data: {
    is_force_insert?: boolean;
  };
};

/* ── Query Keys ─────────────────────────────────────────────────────── */

export const discussionGuideKeys = {
  all: ['discussion-guide'] as const,
  lists: () => [...discussionGuideKeys.all, 'list'] as const,
  list: (workspaceId: string, explorationId: string) =>
    [...discussionGuideKeys.lists(), { workspaceId, explorationId }] as const,
  details: () => [...discussionGuideKeys.all, 'detail'] as const,
  detail: (workspaceId: string, explorationId: string, sectionId: string) =>
    [...discussionGuideKeys.details(), { workspaceId, explorationId, sectionId }] as const,
  generated: (workspaceId: string, explorationId: string) =>
    [...discussionGuideKeys.all, 'generated', { workspaceId, explorationId }] as const,
};

/* ── Queries ────────────────────────────────────────────────────────── */

export const useDiscussionGuide = (
  workspaceId?: string,
  explorationId?: string,
  options = {}
) => {
  return useQuery<GuideResponse>({
    queryKey: discussionGuideKeys.list(workspaceId!, explorationId!),
    queryFn: () =>
      discussionGuideService.getAllSections(workspaceId!, explorationId!),
    enabled: !!(workspaceId && explorationId),
    ...options,
  });
};

export const useGenerateDiscussionGuide = (
  workspaceId?: string,
  explorationId?: string,
  options = {}
) => {
  return useMutation({
    mutationFn: () =>
      discussionGuideService.generateGuide(workspaceId!, explorationId!),
    ...options,
  });
};

/* ── Auto Generate Hook ─────────────────────────────────────────────── */

export const useDiscussionGuideWithAutoGenerate = (
  workspaceId?: string,
  explorationId?: string,
  options = {}
) => {
  const queryClient = useQueryClient();

  const {
    data: guideData,
    isLoading: isGuideLoading,
    error: guideError,
    refetch,
  } = useDiscussionGuide(workspaceId, explorationId, options);

  const generateMutation = useGenerateDiscussionGuide(workspaceId, explorationId, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId!, explorationId!),
      });
    },
  });

  const shouldAutoGenerate =
    guideData?.data?.sections?.length === 0 && !generateMutation.isPending;

  return {
    data: guideData,
    isLoading: isGuideLoading,
    error: guideError,
    refetch,
    generateGuide: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    generationError: generateMutation.error,
    shouldAutoGenerate,
  };
};

/* ── Mutations ─────────────────────────────────────────────────────── */

export const useCreateSection = (
  workspaceId: string,
  explorationId: string
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSectionPayload) =>
      discussionGuideService.createSection(workspaceId, explorationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useUpdateSection = (
  workspaceId: string,
  explorationId: string
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, ...data }: UpdateSectionPayload) =>
      discussionGuideService.updateSection(
        workspaceId,
        explorationId,
        sectionId,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useDeleteSection = (
  workspaceId: string,
  explorationId: string
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, data }: DeleteSectionPayload) =>
      discussionGuideService.deleteSection(
        workspaceId,
        explorationId,
        sectionId,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useCreateQuestion = (
  workspaceId: string,
  explorationId: string
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, ...rest }: CreateQuestionPayload) =>
      discussionGuideService.createQuestion(
        workspaceId,
        explorationId,
        sectionId,
        rest
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useUpdateQuestion = (
  workspaceId: string,
  explorationId: string
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ questionId, data }: UpdateQuestionPayload) =>
      discussionGuideService.updateQuestion(
        workspaceId,
        explorationId,
        questionId,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};

export const useDeleteQuestion = (
  workspaceId: string,
  explorationId: string
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ questionId, data }: DeleteQuestionPayload) =>
      discussionGuideService.deleteQuestion(
        workspaceId,
        explorationId,
        questionId,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: discussionGuideKeys.list(workspaceId, explorationId),
      });
    },
  });
};