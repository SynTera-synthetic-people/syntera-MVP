// hooks/useQuantitativeQueries.js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  simulatePopulation,
  generateQuestionnaire,
  getAllQuestionnaires,
  getPersonas,
  simulateSurvey,
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

const questionnaireQueryKey = (workspaceId, explorationId, simulationId) => [
  'questionnaires',
  workspaceId,
  explorationId,
  simulationId,
];

/** Saved population + questionnaire runs for an exploration (for restore & exports). */
export const usePopulationSimulations = (workspaceId, explorationId) => {
  return useQuery({
    queryKey: ['populationSimulations', workspaceId, explorationId],
    queryFn: () => listPopulationSimulations({ workspaceId, explorationId }),
    enabled: !!workspaceId && !!explorationId,
  });
};

// Personas Query
export const usePersonas = (workspaceId, explorationId) => {
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
    mutationFn: ({ workspaceId, explorationId, personaIds, sampleDistribution }) =>
      simulatePopulation({ workspaceId, explorationId, personaIds, sampleDistribution }),
    onSuccess: (data, variables) => {
      // Invalidate and refetch any related queries
      queryClient.invalidateQueries({
        queryKey: ['simulation', variables.workspaceId, variables.explorationId]
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
    mutationFn: ({ workspaceId, explorationId, personaIds, simulationId }) =>
      generateQuestionnaire({ workspaceId, explorationId, personaIds, simulationId }),
    onSuccess: (data, variables) => {
      // Invalidate questionnaires query to refresh data
      queryClient.invalidateQueries({
        queryKey: ['questionnaires', variables.workspaceId, variables.explorationId]
      });
      queryClient.invalidateQueries({
        queryKey: ['populationSimulations', variables.workspaceId, variables.explorationId],
      });
      // Also set the generated questionnaire in cache
      queryClient.setQueryData(
        ['questionnaire', variables.workspaceId, variables.explorationId, variables.simulationId],
        data
      );
    },
  });
};

// Get All Questionnaires Query
export const useQuestionnaires = (workspaceId, explorationId, simulationId, enabled = true) => {
  return useQuery({
    queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
    queryFn: () => getAllQuestionnaires({ workspaceId, explorationId, simulationId }),
    enabled: enabled && !!workspaceId && !!explorationId && !!simulationId,
  });
};

// Get Single Questionnaire (from cache or API)
export const useQuestionnaire = (workspaceId, explorationId, simulationId) => {
  return useQuery({
    queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
    queryFn: () => getAllQuestionnaires({ workspaceId, explorationId, simulationId }),
    enabled: !!workspaceId && !!explorationId && !!simulationId,
  });
};


export const useSimulateSurvey = () => {
  return useMutation({
    mutationFn: ({ workspaceId, explorationId, personaId, simulationId }) =>
      simulateSurvey({ workspaceId, explorationId, personaId, simulationId }),
  });
};

export const useSurveyResults = (workspaceId, explorationId, simulationId) => {
  return useQuery({
    queryKey: ['surveyResults', workspaceId, explorationId, simulationId],
    queryFn: async () => {
      // If you have a GET endpoint for survey results, implement it here
      // For now, we'll return null since we're simulating
      return null;
    },
    enabled: !!workspaceId && !!explorationId && !!simulationId,
  });
};

export const useDownloadSurveyPdf = () => {
  return useMutation({
    mutationFn: ({ workspaceId, explorationId, simulationId }) =>
      downloadSurveyPdf({ workspaceId, explorationId, simulationId }),
    onSuccess: (blob, variables) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Create meaningful filename
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
    mutationFn: ({ workspaceId, explorationId, simulationId, file }) =>
      uploadQuestionnaire({ workspaceId, explorationId, simulationId, file }),
    onSuccess: (data, variables) => {
      // Invalidate questionnaires query to refresh the data
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(variables.workspaceId, variables.explorationId, variables.simulationId)
      });
    },
  });
};

export const useCreateQuestionnaireSection = (workspaceId, explorationId, simulationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ title, simulationId: nextSimulationId }) =>
      createQuestionnaireSection({
        workspaceId,
        explorationId,
        title,
        simulationId: nextSimulationId ?? simulationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
      });
    },
  });
};

export const useUpdateQuestionnaireSection = (workspaceId, explorationId, simulationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, title }) =>
      updateQuestionnaireSection({ workspaceId, explorationId, sectionId, title }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
      });
    },
  });
};

export const useDeleteQuestionnaireSection = (workspaceId, explorationId, simulationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId }) =>
      deleteQuestionnaireSection({ workspaceId, explorationId, sectionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
      });
    },
  });
};

export const useCreateQuestionnaireQuestion = (workspaceId, explorationId, simulationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, text, options }) =>
      createQuestionnaireQuestion({ workspaceId, explorationId, sectionId, text, options }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
      });
    },
  });
};

export const useUpdateQuestionnaireQuestion = (workspaceId, explorationId, simulationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ questionId, text, options }) =>
      updateQuestionnaireQuestion({ workspaceId, explorationId, questionId, text, options }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
      });
    },
  });
};

export const useDeleteQuestionnaireQuestion = (workspaceId, explorationId, simulationId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ questionId }) =>
      deleteQuestionnaireQuestion({ workspaceId, explorationId, questionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: questionnaireQueryKey(workspaceId, explorationId, simulationId),
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
    }
  });
};

function _triggerBlobDownload(blob, filename, mimeType = 'application/pdf') {
  const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
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
    mutationFn: ({ workspaceId, explorationId, simulationId }) =>
      downloadQuantTranscripts({ workspaceId, explorationId, simulationId }),
    // Returns a ZIP: questionnaire_overview.csv + survey_results.csv
    onSuccess: (blob, { simulationId }) =>
      _triggerBlobDownload(blob, `survey_transcripts_${simulationId}.zip`, 'application/zip'),
  });
};

export const useDownloadQuantDecisionIntelligence = () => {
  return useMutation({
    mutationFn: ({ workspaceId, explorationId, simulationId }) =>
      downloadQuantDecisionIntelligence({ workspaceId, explorationId, simulationId }),
    onSuccess: (blob, { simulationId }) =>
      _triggerBlobDownload(blob, `decision_intelligence_${simulationId}.pdf`),
  });
};

export const useDownloadQuantBehaviorArchaeology = () => {
  return useMutation({
    mutationFn: ({ workspaceId, explorationId, simulationId }) =>
      downloadQuantBehaviorArchaeology({ workspaceId, explorationId, simulationId }),
    onSuccess: (blob, { simulationId }) =>
      _triggerBlobDownload(blob, `behavior_archaeology_${simulationId}.pdf`),
  });
};
