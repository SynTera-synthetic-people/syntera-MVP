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

// Submits one Framer "Add Material" section (Research Brief or Artifact) — a
// file and/or links plus a shared instruction. Backend extracts/fetches and
// summarizes everything synchronously, returning only once that's done (this
// is what drives the real processing -> done bar, not a fake timer).
export const submitFramerMaterialSection = async (
  workspaceId,
  explorationId,
  { kind, instruction, file, links }
) => {
  try {
    const formData = new FormData();
    formData.append('kind', kind);
    if (instruction) formData.append('instruction', instruction);
    if (file) formData.append('file', file);
    (links || []).forEach(link => {
      if (link && link.trim()) formData.append('links', link.trim());
    });

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

