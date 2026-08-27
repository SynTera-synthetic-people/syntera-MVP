// services/personaLibraryService.js
import axiosInstance from '../utils/axiosConfig';

/**
 * Persona Library — a live view over every persona the workspace's organisation
 * already owns. There is no publish step: personas appear automatically as soon
 * as they are calibrated in any exploration in the org.
 *
 * Routes are workspace-scoped so the backend resolves the organisation from the
 * workspace (the authoritative link) rather than trusting a claim on the token.
 * See backend/app/routers/persona_library.py.
 */
export const personaLibraryService = {
  // List reusable personas for the workspace's organisation.
  // Pass explorationId so the backend excludes that exploration's own personas
  // and flags the ones already reused into it.
  getLibrary: async (workspaceId, { explorationId, originWorkspaceId, q, limit, offset } = {}) => {
    const params = {};
    if (explorationId) params.exploration_id = explorationId;
    if (originWorkspaceId) params.origin_workspace_id = originWorkspaceId;
    if (q) params.q = q;
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;

    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/persona-library`,
      { params }
    );
    return response.data;
  },

  // Full detail for one library persona (id is the source persona's id).
  getLibraryItem: async (workspaceId, personaId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/persona-library/${personaId}`
    );
    return response.data;
  },

  // Copy the selected library personas into an exploration.
  // Returns { imported, skipped, quota, personas_still_to_generate }.
  importFromLibrary: async (workspaceId, explorationId, sourcePersonaIds) => {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/personas/import-from-library`,
      { source_persona_ids: sourcePersonaIds }
    );
    return response.data;
  },
};
