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

