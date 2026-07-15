import axios from 'axios';
import axiosInstance from '../utils/axiosConfig';


// Initialize Omi session
export const initializeOmiSession = async (explorationId) => {
  try {
    const response = await axiosInstance.post(`/workspaces/omi/session`, null, {
      params: { exploration_id: explorationId }
    });
    return response.data;
  } catch (error) {
    console.error('Error initializing Omi session:', error);
    throw error;
  }
};

// Send message to Omi
// export const sendMessageToOmi = async (explorationId, message) => {
//   try {
//     const response = await axiosInstance.post(`/workspaces/omi/chat`, {
//       message
//     }, {
//       params: { exploration_id: explorationId }
//     });
//     return response.data;
//   } catch (error) {
//     console.error('Error sending message to Omi:', error);
//     throw error;
//   }
// };

export const sendMessageToOmi = async (explorationId, sessionId, message) => {
  try {
    const response = await axiosInstance.post(`/workspaces/omi/chat`, {
      message,
      session_id: sessionId,
      exploration_id: explorationId
    });
    return response.data;
  } catch (error) {
    console.error('Error sending message to Omi:', error);
    throw error;
  }
};

export const createResearchObjective = async (explorationId) => {
  try {
    const response = await axiosInstance.post(`/workspaces/{workspace_id}/research/objectives/?exploration_id=${explorationId}`);
    return response.data;
  } catch (error) {
    console.error('Error creating research objective:', error);
    throw error;
  }
};

// Save the Research Objective Framer's structured fields — backend synthesizes
// them into the research objective description via the existing RO pipeline.
export const createResearchObjectiveFromFramer = async (workspaceId, explorationId, framerPayload) => {
  try {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/research/objectives/from-framer`,
      framerPayload,
      { params: { exploration_id: explorationId } }
    );
    return response.data;
  } catch (error) {
    console.error('Error saving research objective from Framer:', error);
    throw error;
  }
};

// Submits one Framer "Add Material" section (Research Brief or Artifact) —
// one-or-several files and/or links plus a shared instruction. Backend
// extracts/fetches and summarizes everything synchronously, returning only
// once that's done (this is what drives the real processing -> done bar,
// not a fake timer).
//
// `file` (singular) is kept for the Research Brief section, which only ever
// attaches one file. `files` (plural array) is for the Artifact section,
// which supports up to ARTIFACT_MAX_FILES. Both land in the same backend
// `files` form field — the endpoint accepts a list either way.
//
// comparison_mode/artifact_category are Artifact-section-only: how Omi
// should relate multiple artifacts ("compare" | "campaign_set") and the
// content category driving the artifact pipeline's dimension selection
// (e.g. "ad_creative"). Both are ignored server-side for kind="brief".
export const submitFramerMaterialSection = async (
  workspaceId,
  explorationId,
  { kind, instruction, file, files, links, comparison_mode, artifact_category }
) => {
  try {
    const formData = new FormData();
    formData.append('kind', kind);
    if (instruction) formData.append('instruction', instruction);
    if (file) formData.append('files', file);
    (files || []).forEach(f => {
      if (f) formData.append('files', f);
    });
    (links || []).forEach(link => {
      if (link && link.trim()) formData.append('links', link.trim());
    });
    if (comparison_mode) formData.append('comparison_mode', comparison_mode);
    if (artifact_category) formData.append('artifact_category', artifact_category);

    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/research/objectives/framer-materials`,
      formData,
      {
        params: { exploration_id: explorationId },
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error submitting Framer material section:', error);
    throw error;
  }
};

export const getConversationHistory = async (workspaceId, explorationId) => {
  try {
    const response = await axiosInstance.get(`/workspaces/omi/conversation`, {
      params: {
        workspace_id: workspaceId,
        exploration_id: explorationId
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    throw error;
  }
};

export const patchResearchObjectiveSummary = async (workspaceId, explorationId, description) => {
  const response = await axiosInstance.patch(
    `/workspaces/${workspaceId}/research/objectives/summary`,
    { description },
    { params: { exploration_id: explorationId } }
  );
  return response.data;
};

export const patchOmiMessageContent = async (messageId, content) => {
  const response = await axiosInstance.patch(
    `/workspaces/omi/messages/${messageId}`,
    { content }
  );
  return response.data;
};

