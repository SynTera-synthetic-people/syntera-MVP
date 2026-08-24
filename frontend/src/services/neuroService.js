// Read-only access to the neuroscience layer endpoints. Every call returns
// null instead of throwing so callers can hide the panel when the layer is
// off, unreachable, or has recorded nothing yet.
import axiosInstance from '../utils/axiosConfig';

const quiet = async (fn) => {
  try {
    const response = await fn();
    return response?.data?.data ?? null;
  } catch (err) {
    return null;
  }
};

export const neuroService = {
  getStatus: () => quiet(() => axiosInstance.get('/neuro/status')),

  getConversationState: (workspaceId, explorationId, personaId) =>
    quiet(() =>
      axiosInstance.get(
        `/neuro/workspaces/${workspaceId}/explorations/${explorationId}/personas/${personaId}/state`
      )
    ),

  getConversationEvents: (workspaceId, explorationId, personaId, limit = 100) =>
    quiet(() =>
      axiosInstance.get(
        `/neuro/workspaces/${workspaceId}/explorations/${explorationId}/personas/${personaId}/events`,
        { params: { limit } }
      )
    ),

  getEffectiveN: (workspaceId, explorationId) =>
    quiet(() =>
      axiosInstance.get(
        `/neuro/workspaces/${workspaceId}/explorations/${explorationId}/effective-n`
      )
    ),

  listPersonas: (workspaceId, explorationId) =>
    quiet(() =>
      axiosInstance.get(
        `/workspaces/${workspaceId}/explorations/${explorationId}/personas/`
      )
    ),
};

export default neuroService;
