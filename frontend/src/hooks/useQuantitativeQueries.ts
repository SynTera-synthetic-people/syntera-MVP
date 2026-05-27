// hooks/useQuantitativeQueries.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  simulatePopulation,
  generateQuestionnaire,
  getAllQuestionnaires,
  getAllQuestionnairesForExploration,
  getPersonas,
  simulateSurvey,
  getSurveySimulationBySource,
  downloadSurveyPdf,
  uploadQuestionnaire,
  previewSurvey,
  listPopulationSimulations,
  downloadQuantTranscripts,
  downloadQuantDecisionIntelligence,
  downloadQuantBehaviorArchaeology,
  createQuestionnaireSection,
  updateQuestionnaireSection,
  deleteQuestionnaireSection,
  createQuestionnaireQuestion,
  updateQuestionnaireQuestion,
  deleteQuestionnaireQuestion,
} from '../services/quantitativeServices';

interface QueryParams {
  workspaceId?: string;
  explorationId?: string;
}

interface SimulatePopulationPayload extends QueryParams {
  personaIds: string[];
  sampleDistribution: Record<string, number>;
}

interface GenerateQuestionnairePayload extends QueryParams {
  personaIds: string[];
  simulationId?: string; // optional — not available at questionnaire-design step (pre-population)
}

interface SimulateSurveyPayload extends QueryParams {
  personaId: string | string[];
  simulationId: string;
  forceRerun?: boolean;
}

interface EnsureSurveySimulationPayload extends QueryParams {
  personaIds: string[];
  simulationId: string;
  forceRerun?: boolean;
}

interface DownloadPayload extends QueryParams {
  simulationId: string;
  personaName?: string;
}

interface UploadQuestionnairePayload extends QueryParams {
  simulationId: string;
  file: File;
}

interface QuestionnaireSectionPayload {
  sectionId?: string;
  title?: string;
  simulationId?: string;
}

interface QuestionnaireQuestionPayload {
  questionId?: string;
  sectionId?: string;
  text?: string;
  options?: unknown[];
  question_type?: string;
  config?: Record<string, unknown>;
}

const questionnaireQueryKey = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string | null,
) => [
    'questionnaires',
    workspaceId,
    explorationId,
    simulationId,
  ];

const surveySimulationInFlight = new Map<string, Promise<any>>();

export const surveySimulationBySourceQueryKey = (
  workspaceId?: string,
  explorationId?: string,
  simulationSourceId?: string | null,
) => [
    'surveySimulationBySource',
    workspaceId,
    explorationId,
    simulationSourceId,
  ];

/**
 * Fetch all questionnaire sections for an exploration without needing a simulation_id.
 * Used by the Questionnaire Design step (Step 1 of Quant) to load LLM-generated questions.
 */
export const useAllQuestionnairesForExploration = (
  workspaceId?: string,
  explorationId?: string,
) => {
  return useQuery({
    queryKey: ['questionnairesAll', workspaceId, explorationId],
    queryFn: () => getAllQuestionnairesForExploration({ workspaceId, explorationId }),
    enabled: !!workspaceId && !!explorationId,
    staleTime: 30_000,
  });
};

/** Saved population + questionnaire runs for an exploration (for restore & exports). */
export const usePopulationSimulations = (
  workspaceId?: string,
  explorationId?: string,
) => {
  return useQuery({
    queryKey: ['populationSimulations', workspaceId, explorationId],
    queryFn: () => listPopulationSimulations({ workspaceId, explorationId }),
    enabled: !!workspaceId && !!explorationId,
  });
};

// Personas Query
export const usePersonas = (
  workspaceId?: string,
  explorationId?: string,
) => {
  return useQuery({
    queryKey: ['personas', workspaceId, explorationId],
    queryFn: () => getPersonas({ workspaceId, explorationId }),
    enabled: !!workspaceId && !!explorationId,
  });
};

// Population Simulation Mutation
export const useSimulatePopulation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      personaIds,
      sampleDistribution,
    }: SimulatePopulationPayload) =>
      simulatePopulation({
        workspaceId,
        explorationId,
        personaIds,
        sampleDistribution,
      }),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['simulation', variables.workspaceId, variables.explorationId],
      });

      queryClient.invalidateQueries({
        queryKey: ['populationSimulations', variables.workspaceId, variables.explorationId],
      });
    },
  });
};

// Generate Questionnaire Mutation
export const useGenerateQuestionnaire = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      personaIds,
      simulationId,
    }: GenerateQuestionnairePayload) =>
      generateQuestionnaire({
        workspaceId,
        explorationId,
        personaIds,
        simulationId,
      }),

    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['questionnaires', variables.workspaceId, variables.explorationId],
      });

      queryClient.invalidateQueries({
        queryKey: ['populationSimulations', variables.workspaceId, variables.explorationId],
      });

      queryClient.setQueryData(
        [
          'questionnaire',
          variables.workspaceId,
          variables.explorationId,
          variables.simulationId,
        ],
        data,
      );
    },
  });
};

// Get All Questionnaires Query
export const useQuestionnaires = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string | null,
  enabled = true,
) => {
  return useQuery({
    queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
    queryFn: () =>
      getAllQuestionnaires({
        workspaceId,
        explorationId,
        simulationId,
      }),
    enabled: enabled && !!workspaceId && !!explorationId && !!simulationId,
  });
};

// Get Single Questionnaire
export const useQuestionnaire = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string | null,
) => {
  return useQuery({
    queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
    queryFn: () =>
      getAllQuestionnaires({
        workspaceId,
        explorationId,
        simulationId,
      }),
    enabled: !!workspaceId && !!explorationId && !!simulationId,
  });
};

export const useSimulateSurvey = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      personaId,
      simulationId,
      forceRerun,
    }: SimulateSurveyPayload) =>
      simulateSurvey({
        workspaceId,
        explorationId,
        personaId,
        simulationId,
        forceRerun,
      }),
  });
};

export const useEnsureSurveySimulation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      explorationId,
      personaIds,
      simulationId,
      forceRerun = false,
    }: EnsureSurveySimulationPayload) => {
      if (!workspaceId || !explorationId || !simulationId) {
        throw new Error('Missing survey simulation context.');
      }

      const queryKey = surveySimulationBySourceQueryKey(workspaceId, explorationId, simulationId);
      const inFlightKey = `${workspaceId}:${explorationId}:${simulationId}:${forceRerun ? 'force' : 'normal'}`;
      const inFlight = surveySimulationInFlight.get(inFlightKey);
      if (inFlight) return inFlight;

      const promise = (async () => {
        if (!forceRerun) {
          const cached = queryClient.getQueryData<any>(queryKey);
          if (cached?.data?.id) return cached;

          const existing = await getSurveySimulationBySource({
            workspaceId,
            explorationId,
            simulationSourceId: simulationId,
          });
          if (existing?.data?.id) {
            queryClient.setQueryData(queryKey, existing);
            return existing;
          }
        } else {
          queryClient.removeQueries({ queryKey });
        }

        if (!personaIds.length) {
          throw new Error('No personas available to run the survey simulation.');
        }

        const created = await simulateSurvey({
          workspaceId,
          explorationId,
          personaId: personaIds,
          simulationId,
          forceRerun,
        });
        queryClient.setQueryData(queryKey, created);
        return created;
      })().finally(() => {
        surveySimulationInFlight.delete(inFlightKey);
      });

      surveySimulationInFlight.set(inFlightKey, promise);
      return promise;
    },
  });
};

/**
 * Fetch an already-completed survey simulation for a population simulation ID.
 */
const FIVE_MINUTES = 5 * 60 * 1000;

export const useGetSurveySimulationBySource = (
  workspaceId?: string,
  explorationId?: string,
  simulationSourceId?: string | null,
) => {
  return useQuery({
    queryKey: surveySimulationBySourceQueryKey(workspaceId, explorationId, simulationSourceId),
    queryFn: () =>
      getSurveySimulationBySource({
        workspaceId,
        explorationId,
        simulationSourceId,
      }),
    enabled: !!workspaceId && !!explorationId && !!simulationSourceId,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
};

export const useSurveyResults = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string | null,
) => {
  return useQuery({
    queryKey: ['surveyResults', workspaceId, explorationId, simulationId],
    queryFn: () =>
      getSurveySimulationBySource({
        workspaceId,
        explorationId,
        simulationSourceId: simulationId,
      }),
    enabled: !!workspaceId && !!explorationId && !!simulationId,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
};

export const useDownloadSurveyPdf = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      simulationId,
    }: DownloadPayload) =>
      downloadSurveyPdf({
        workspaceId,
        explorationId,
        simulationId,
      }),

    onSuccess: (blob, variables) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;

      const fileName = variables.personaName
        ? `survey-report-${variables.personaName}.pdf`
        : `survey-report-${variables.simulationId}.pdf`;

      a.download = fileName;

      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
};

export const useUploadQuestionnaire = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      simulationId,
      file,
    }: UploadQuestionnairePayload) =>
      uploadQuestionnaire({
        workspaceId,
        explorationId,
        simulationId,
        file,
      }),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(
          variables.workspaceId,
          variables.explorationId,
          variables.simulationId,
        ),
      });
    },
  });
};

export const useCreateQuestionnaireSection = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      title,
      simulationId: nextSimulationId,
    }: QuestionnaireSectionPayload) =>
      createQuestionnaireSection({
        workspaceId,
        explorationId,
        title,
        simulationId: nextSimulationId ?? simulationId,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(
          workspaceId,
          explorationId,
          simulationId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['questionnairesAll', workspaceId, explorationId],
      });
    },
  });
};

export const useUpdateQuestionnaireSection = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sectionId,
      title,
    }: QuestionnaireSectionPayload) =>
      updateQuestionnaireSection({
        workspaceId,
        explorationId,
        sectionId,
        title,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(
          workspaceId,
          explorationId,
          simulationId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['questionnairesAll', workspaceId, explorationId],
      });
    },
  });
};

export const useDeleteQuestionnaireSection = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sectionId,
    }: QuestionnaireSectionPayload) =>
      deleteQuestionnaireSection({
        workspaceId,
        explorationId,
        sectionId,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(
          workspaceId,
          explorationId,
          simulationId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['questionnairesAll', workspaceId, explorationId],
      });
    },
  });
};

export const useCreateQuestionnaireQuestion = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sectionId,
      text,
      options,
      question_type,
      config,
    }: QuestionnaireQuestionPayload) =>
      createQuestionnaireQuestion({
        workspaceId,
        explorationId,
        sectionId,
        text,
        options,
        question_type,
        config,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(
          workspaceId,
          explorationId,
          simulationId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['questionnairesAll', workspaceId, explorationId],
      });
    },
  });
};

export const useUpdateQuestionnaireQuestion = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      questionId,
      text,
      options,
      question_type,
      config,
    }: QuestionnaireQuestionPayload) =>
      updateQuestionnaireQuestion({
        workspaceId,
        explorationId,
        questionId,
        text,
        options,
        question_type,
        config,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(
          workspaceId,
          explorationId,
          simulationId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['questionnairesAll', workspaceId, explorationId],
      });
    },
  });
};

export const useDeleteQuestionnaireQuestion = (
  workspaceId?: string,
  explorationId?: string,
  simulationId?: string,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      questionId,
    }: QuestionnaireQuestionPayload) =>
      deleteQuestionnaireQuestion({
        workspaceId,
        explorationId,
        questionId,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(
          workspaceId,
          explorationId,
          simulationId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['questionnairesAll', workspaceId, explorationId],
      });
    },
  });
};

export const usePreviewSurvey = () => {
  return useMutation({
    mutationFn: previewSurvey,

    onError: (error) => {
      console.error('Error previewing survey:', error);
      throw error;
    },
  });
};

function _triggerBlobDownload(
  blob: BlobPart,
  filename: string,
  mimeType = 'application/pdf',
) {
  const url = window.URL.createObjectURL(
    new Blob([blob], { type: mimeType }),
  );

  const a = document.createElement('a');

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export const useDownloadQuantTranscripts = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      simulationId,
    }: DownloadPayload) =>
      downloadQuantTranscripts({
        workspaceId,
        explorationId,
        simulationId,
      }),

    onSuccess: (blob, { simulationId }) =>
      _triggerBlobDownload(
        blob,
        `survey_transcripts_${simulationId}.zip`,
        'application/zip',
      ),
  });
};

export const useDownloadQuantDecisionIntelligence = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      simulationId,
    }: DownloadPayload) =>
      downloadQuantDecisionIntelligence({
        workspaceId,
        explorationId,
        simulationId,
      }),

    onSuccess: (blob, { simulationId }) =>
      _triggerBlobDownload(
        blob,
        `decision_intelligence_${simulationId}.pdf`,
      ),
  });
};

export const useDownloadQuantBehaviorArchaeology = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      explorationId,
      simulationId,
    }: DownloadPayload) =>
      downloadQuantBehaviorArchaeology({
        workspaceId,
        explorationId,
        simulationId,
      }),

    onSuccess: (blob, { simulationId }) =>
      _triggerBlobDownload(
        blob,
        `behavior_archaeology_${simulationId}.pdf`,
      ),
  });
};
