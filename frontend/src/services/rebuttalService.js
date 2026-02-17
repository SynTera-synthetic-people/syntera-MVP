import axiosInstance from '../utils/axiosConfig';

// API endpoints
export const rebuttalApi = {
  // Get all questions for rebuttal
  getQuestions: (workspaceId, explorationId, data) =>
    axiosInstance.get(`/workspaces/${workspaceId}/explorations/${explorationId}/rebuttal/questions`, {
      params: data
    }),

  // Start a rebuttal session
  startRebuttal: (workspaceId, explorationId, data) =>
    axiosInstance.post(`/workspaces/${workspaceId}/explorations/${explorationId}/rebuttal/start`, data),

  // Send message in rebuttal session
  sendReply: (workspaceId, explorationId, data) =>
    axiosInstance.post(`/workspaces/${workspaceId}/explorations/${explorationId}/rebuttal/reply`, data),

  // Get session details
  getSession: (workspaceId, explorationId, sessionId) =>
    axiosInstance.get(`/workspaces/${workspaceId}/explorations/${explorationId}/rebuttal/session/${sessionId}`),

  getSessions: (workspaceId, explorationId) =>
    axiosInstance.get(`/workspaces/${workspaceId}/explorations/${explorationId}/rebuttal/sessions`),
};