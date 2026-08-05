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

export type GuideLimits = {
  default_questions_per_section: number;
  max_extra_questions_per_section: number;
  max_questions_per_section: number;
  max_sections_per_guide: number;
  max_questions_per_guide: number;
};

type GuideLimitsResponse = { data?: GuideLimits };

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

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 150);
}

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
  limits: (workspaceId: string, explorationId: string) =>
    [...discussionGuideKeys.all, 'limits', { workspaceId, explorationId }] as const,
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

/**
 * Discussion Guide size limits, served from backend settings.
 *
 * Fetched rather than hardcoded so the caps stay defined in exactly one place
 * (`Settings.DG_*`). Falls back to undefined while loading; callers should
 * treat "limits not yet known" as "do not block", since the backend enforces
 * the cap regardless of what the UI shows.
 */
export const useDiscussionGuideLimits = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useQuery<GuideLimitsResponse>({
    queryKey: discussionGuideKeys.limits(workspaceId!, explorationId!),
    queryFn: () => discussionGuideService.getLimits(workspaceId!, explorationId!),
    enabled: !!(workspaceId && explorationId),
    staleTime: Infinity, // configuration, not per-request state
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

export const useDownloadDiscussionGuide = (
  workspaceId?: string,
  explorationId?: string
) => {
  return useMutation<Blob, Error, void>({
    mutationFn: () =>
      discussionGuideService.downloadGuide(workspaceId!, explorationId!),
    onSuccess: (blob) => {
      triggerBlobDownload(blob, `discussion_guide_${explorationId}.pdf`);
    },
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
