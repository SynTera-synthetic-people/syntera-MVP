// services/discussionGuideService.js
import axiosInstance from '../utils/axiosConfig';

export const discussionGuideService = {
  // Auto-generate discussion guide
  generateGuide: async (workspaceId, explorationId) => {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/guides/generate`,
      { exploration_id: explorationId }
    );
    return response.data;
  },

  // Get all sections with questions
  getSections: async (workspaceId, explorationId) => {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/sections`
    );
    return response.data;
  },

  getAllSections: async (workspaceId, explorationId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/all`
    );
    return response.data;
  },

  // Create a new section
  createSection: async (workspaceId, explorationId, data) => {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/sections`,
      { ...data, exploration_id: explorationId }
    );
    return response.data;
  },

  // Update a section
  updateSection: async (workspaceId, explorationId, sectionId, data) => {
    const response = await axiosInstance.put(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/sections/${sectionId}`,
      { ...data, exploration_id: explorationId }
    );
    return response.data;
  },

  // Delete a section
  deleteSection: async (workspaceId, explorationId, sectionId, data = {}) => {
    const response = await axiosInstance.delete(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/sections/${sectionId}`,
      { data: { ...data, exploration_id: explorationId } }
    );
    return response.data;
  },

  // Create a question
  createQuestion: async (workspaceId, explorationId, sectionId, data) => {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/sections/${sectionId}/questions`,
      { ...data, exploration_id: explorationId }
    );
    return response.data;
  },

  // Update a question
  updateQuestion: async (workspaceId, explorationId, questionId, data) => {
    const response = await axiosInstance.put(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/questions/${questionId}`,
      { ...data, exploration_id: explorationId }
    );
    return response.data;
  },

  // Delete a question
  deleteQuestion: async (workspaceId, explorationId, questionId, data = {}) => {
    const response = await axiosInstance.delete(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/questions/${questionId}`,
      { data: { ...data, exploration_id: explorationId } }
    );
    return response.data;
  },
};