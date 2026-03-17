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

  getInviteDetails: async (token) => {
    try {
      const response = await axiosInstance.get('/workspaces/invitations/details', {
        params: { token },
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  acceptInvitation: async (token) => {
    try {
      const response = await axiosInstance.post('/workspaces/invitations/accept', null, {
        params: { token },
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  getMembers: async (workspaceId) => {
    try {
      const response = await axiosInstance.get(`/workspaces/${workspaceId}/members`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  inviteMember: async (workspaceId, payload) => {
    try {
      const response = await axiosInstance.post(`/workspaces/${workspaceId}/invite`, payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  removeMember: async (workspaceId, memberId) => {
    try {
      const response = await axiosInstance.delete(`/workspaces/${workspaceId}/members/${memberId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};
