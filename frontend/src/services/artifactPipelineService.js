// services/artifactPipelineService.js
import axiosInstance from '../utils/axiosConfig';

export const artifactPipelineService = {
  // List artifact files available for this exploration
  getAvailableFiles: async (workspaceId, explorationId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/artifacts/available-files`
    );
    return response.data; // { status, message, data: files[] }
  },

  // Kick off a new artifact pipeline run
  createRun: async (workspaceId, explorationId, payload) => {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/artifacts/runs`,
      payload
    );
    return response.data; // { status, message, data: { run_id } }
  },

  // Poll run status
  getRunStatus: async (workspaceId, explorationId, runId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/artifacts/runs/${runId}`
    );
    return response.data; // includes status, stages_completed, persona_progress, etc.
  },

  // Stage 4 (qual): call once the run reaches status="questionnaire_ready".
  // Each listed persona individually answers every guide question.
  triggerPersonaResponses: async (workspaceId, explorationId, runId, personaIds) => {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/artifacts/runs/${runId}/personas`,
      { persona_ids: personaIds }
    );
    return response.data; // { status, message, data: { run_id } }
  },

  // Fetch final results once a run is completed
  getRunResults: async (workspaceId, explorationId, runId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/artifacts/runs/${runId}/results`
    );
    return response.data;
  },
};