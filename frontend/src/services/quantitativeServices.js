import axiosInstance from "../utils/axiosConfig";
import API_CONFIG from "../config/apiConfig";

const REPORT_DOWNLOAD_TIMEOUT = Math.max(
  API_CONFIG.TIMEOUT || 0,
  Number(import.meta.env.VITE_REPORT_TIMEOUT || 960000),
);

/** List saved population simulations for an exploration (newest can be restored with questionnaire). */
export const listPopulationSimulations = async ({ workspaceId, explorationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/population/simulations`
  );
  const payload = response.data;
  return Array.isArray(payload?.data) ? payload.data : [];
};

/** Download all questionnaire sections for an exploration as CSV (no simulation needed — questionnaire design page). */
export const downloadExplorationQuestionnaireCsv = async ({ workspaceId, explorationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/export-csv`,
    { responseType: "blob" }
  );
  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "questionnaire.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** Download questionnaire CSV from server (Q No., Question, Options). */
export const downloadQuestionnaireCsvExport = async ({
  workspaceId,
  explorationId,
  simulationId,
  surveySimulationId,
}) => {
  const qs =
    surveySimulationId != null && surveySimulationId !== ""
      ? `?survey_simulation_id=${encodeURIComponent(surveySimulationId)}`
      : "";
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/export-csv/${simulationId}${qs}`,
    { responseType: "blob" }
  );
  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "questionnaire_exploration.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

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
  const payload = {
    exploration_id: explorationId,
    persona_id: personaIds,
  };
  if (simulationId) {
    payload.simulation_id = simulationId;
  }

  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/generate`,
    payload
  );
  return response.data;
};

export const getQuestionnaireGenerationStatus = async ({ workspaceId, explorationId, jobId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/generation/${jobId}`
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

/** Fetch all questionnaire sections for an exploration — no simulation_id needed. */
export const getAllQuestionnairesForExploration = async ({ workspaceId, explorationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/all`
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

/**
 * Fetch an already-completed survey simulation for a given population simulation ID.
 * Returns null (not throws) when no result exists yet, so callers can branch on it.
 */
export const getSurveySimulationBySource = async ({ workspaceId, explorationId, simulationSourceId }) => {
  try {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/simulation/by-source/${simulationSourceId}`
    );
    return response.data;
  } catch (err) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
};

export const simulateSurvey = async ({ workspaceId, explorationId, personaId, simulationId, forceRerun = false }) => {
  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/simulate`,
    {
      exploration_id: explorationId,
      persona_id: personaId,
      simulation_id: simulationId,
      questions: [],
      force_rerun: forceRerun,
    }
  );

  const payload = response.data;

  // Backend offloads to a background task and returns {should_poll: true}.
  // Poll by-source until the simulation row is written (up to 10 min).
  if (payload?.data?.should_poll && simulationId) {
    const MAX_ATTEMPTS = 120; // 120 × 5 s = 10 min ceiling
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      const existing = await getSurveySimulationBySource({
        workspaceId,
        explorationId,
        simulationSourceId: simulationId,
      });
      if (existing?.data?.id) return existing;
    }
    throw new Error('Survey simulation timed out after 10 minutes. Please try again.');
  }

  return payload;
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
  const query = simulationId ? `?simulation_id=${encodeURIComponent(simulationId)}` : "";

  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/upload${query}`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

export const createQuestionnaireSection = async ({ workspaceId, explorationId, title, simulationId }) => {
  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/sections`,
    {
      title,
      simulation_id: simulationId,
    }
  );
  return response.data;
};

export const updateQuestionnaireSection = async ({ workspaceId, explorationId, sectionId, title }) => {
  const response = await axiosInstance.put(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/sections/${sectionId}`,
    { title }
  );
  return response.data;
};

export const deleteQuestionnaireSection = async ({ workspaceId, explorationId, sectionId }) => {
  const response = await axiosInstance.delete(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/sections/${sectionId}`
  );
  return response.data;
};

export const createQuestionnaireQuestion = async ({ workspaceId, explorationId, sectionId, text, options, question_type, config }) => {
  const response = await axiosInstance.post(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/sections/${sectionId}/questions`,
    { text, options, question_type, config }
  );
  return response.data;
};

export const updateQuestionnaireQuestion = async ({ workspaceId, explorationId, questionId, text, options, question_type, config }) => {
  const response = await axiosInstance.put(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/questions/${questionId}`,
    { text, options, question_type, config }
  );
  return response.data;
};

export const deleteQuestionnaireQuestion = async ({ workspaceId, explorationId, questionId }) => {
  const response = await axiosInstance.delete(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/questions/${questionId}`
  );
  return response.data;
};

export const previewSurvey = async ({ workspaceId, explorationId, simulationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/questionnaire/simulation/${simulationId}/preview`
  );
  return response.data;
};

// ── New 3-CTA report downloads ──────────────────────────────────────────────
// These functions only fetch and return the blob.
// Download triggering is handled by the useMutation onSuccess in useQuantitativeQueries.js.

export const downloadQuantTranscripts = async ({ workspaceId, explorationId, simulationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/reports/quant/${simulationId}/transcripts`,
    { responseType: 'blob', timeout: REPORT_DOWNLOAD_TIMEOUT }
  );
  return response.data;
};

export const downloadQuantDecisionIntelligence = async ({ workspaceId, explorationId, simulationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/reports/quant/${simulationId}/decision-intelligence`,
    { responseType: 'blob', timeout: REPORT_DOWNLOAD_TIMEOUT }
  );
  return response.data;
};

export const downloadQuantBehaviorArchaeology = async ({ workspaceId, explorationId, simulationId }) => {
  const response = await axiosInstance.get(
    `/workspaces/${workspaceId}/explorations/${explorationId}/reports/quant/${simulationId}/behavior-archaeology`,
    { responseType: 'blob', timeout: REPORT_DOWNLOAD_TIMEOUT }
  );
  return response.data;
};
