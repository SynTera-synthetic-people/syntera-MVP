import axiosInstance from "../utils/axiosConfig";

export const explorationService = {
  getAll: async (workspaceId) => {
    try {
      const response = await axiosInstance.get(`/explorations/workspace/${workspaceId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  getById: async (explorationId) => {
    try {
      const response = await axiosInstance.get(`/explorations/${explorationId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  create: async (explorationData) => {
    try {
      const response = await axiosInstance.post('/explorations', explorationData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  update: async (explorationId, explorationData) => {
    try {
      const response = await axiosInstance.put(`/explorations/${explorationId}`, explorationData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  delete: async (explorationId) => {
    try {
      const response = await axiosInstance.delete(`/explorations/${explorationId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  updateMethod: async (explorationId, methodData) => {
    try {
      const response = await axiosInstance.post(`/explorations/${explorationId}/method`, methodData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  endExploration: async (explorationId) => {
    try {
      const response = await axiosInstance.post(`/explorations/${explorationId}/method`, {
        is_end: true
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  getTraceability: async (workspaceId, explorationId, params) => {
    try {
      const response = await axiosInstance.get(`/workspaces/${workspaceId}/explorations/${explorationId}/traceability`, { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};