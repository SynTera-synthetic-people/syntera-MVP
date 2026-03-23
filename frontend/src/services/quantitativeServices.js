import axiosInstance from "../utils/axiosConfig";

export const simulatePopulation = async ({ workspaceId, explorationId, personaIds, sampleDistribution }) => {
  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/population/simulate`,
    {
      exploration_id: explorationId,
      persona_ids: personaIds,
      sample_distribution: sampleDistribution
    }
  );
  return response.data;
};

export const generateQuestionnaire = async ({ workspaceId, explorationId, personaIds, simulationId }) => {
  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/generate`,
    {
      exploration_id: explorationId,
      persona_id: personaIds,
      simulation_id: simulationId
    }
  );
  return response.data;
};

// 3. Get All Questionnaires API
export const getAllQuestionnaires = async ({ workspaceId, explorationId, simulationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/allquestionnaires/${simulationId}`
  );
  return response.data;
};

// 4. Personas API (if you need it separately)
export const getPersonas = async ({ workspaceId, explorationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/personas` // Adjust endpoint as needed
  );
  return response.data;
};

export const simulateSurvey = async ({ workspaceId, explorationId, personaId, simulationId, sampleSize, questions }) => {
  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/simulate`,
    {
      exploration_id: explorationId,
      persona_id: personaId,
      simulation_id: simulationId,
      // questions: questions || []
      questions: []
    }
  );
  return response.data;
};


export const downloadSurveyPdf = async ({ workspaceId, explorationId, simulationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/simulation/${simulationId}/download`,
    {
      responseType: 'blob', // Important for file downloads
    }
  );
  return response.data;
};

export const uploadQuestionnaire = async ({ workspaceId, explorationId, simulationId, file }) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/upload?simulation_id=${simulationId}`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

export const previewSurvey = async ({ workspaceId, explorationId, simulationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/simulation/${simulationId}/preview`
  );
  return response.data;
};