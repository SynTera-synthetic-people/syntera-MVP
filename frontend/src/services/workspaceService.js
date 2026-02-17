import axiosInstance from "../utils/axiosConfig";

export const workspaceService = {
  getAll: async () => {
    try {
      const response = await axiosInstance.get('/workspaces');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  getById: async (workspaceId) => {
    try {
      const response = await axiosInstance.get(`/workspaces/${workspaceId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  create: async (workspaceData) => {
    try {
      const response = await axiosInstance.post('/workspaces', workspaceData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  update: async (workspaceId, workspaceData) => {
    try {
      const response = await axiosInstance.put(`/workspaces/${workspaceId}`, workspaceData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  delete: async (workspaceId) => {
    try {
      const response = await axiosInstance.delete(`/workspaces/${workspaceId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};