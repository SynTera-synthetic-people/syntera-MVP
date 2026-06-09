import axiosInstance from '../utils/axiosConfig';

const base = (workspaceId, explorationId) =>
  `/workspaces/${workspaceId}/explorations/${explorationId}/decision-room`;

export const decisionRoomApi = {
  // Create a new session — assembles research context on the backend
  createSession: (workspaceId, explorationId, flow) =>
    axiosInstance.post(`${base(workspaceId, explorationId)}/sessions`, { flow }),

  // List sessions (optionally filter by flow)
  listSessions: (workspaceId, explorationId, flow) =>
    axiosInstance.get(`${base(workspaceId, explorationId)}/sessions`, {
      params: flow ? { flow } : undefined,
    }),

  // Get full session with ordered messages
  getSession: (workspaceId, explorationId, sessionId) =>
    axiosInstance.get(`${base(workspaceId, explorationId)}/sessions/${sessionId}`),

  // Send a message (non-streaming, returns full analyst response)
  sendMessage: (workspaceId, explorationId, sessionId, text) =>
    axiosInstance.post(
      `${base(workspaceId, explorationId)}/sessions/${sessionId}/message`,
      { text },
    ),

  // Delete (soft-archive) a session
  deleteSession: (workspaceId, explorationId, sessionId) =>
    axiosInstance.delete(`${base(workspaceId, explorationId)}/sessions/${sessionId}`),

  // Streaming send — returns the fetch URL + options (caller must use fetch() directly)
  getStreamUrl: (workspaceId, explorationId, sessionId) =>
    `${axiosInstance.defaults.baseURL}${base(workspaceId, explorationId)}/sessions/${sessionId}/message/stream`,
};
