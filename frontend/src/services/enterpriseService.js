import axiosInstance from '../utils/axiosConfig';

export const enterpriseService = {
  // SP admin — provision a new enterprise org + its admin user
  createOrg: async (payload) => {
    try {
      const response = await axiosInstance.post('/enterprise/organizations', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // SP admin — list all enterprise orgs
  listOrgs: async () => {
    try {
      const response = await axiosInstance.get('/enterprise/organizations');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Get a single enterprise org by ID
  getOrg: async (orgId) => {
    try {
      const response = await axiosInstance.get(`/enterprise/organizations/${orgId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // SP admin — update an org's exploration quota
  updateOrgLimit: async (orgId, explorationLimit) => {
    try {
      const response = await axiosInstance.patch(
        `/enterprise/organizations/${orgId}/limit`,
        { exploration_limit: explorationLimit }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Add a member to an enterprise org
  addMember: async (orgId, payload) => {
    try {
      const response = await axiosInstance.post(
        `/enterprise/organizations/${orgId}/members`,
        payload
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // List all members of an enterprise org
  listMembers: async (orgId) => {
    try {
      const response = await axiosInstance.get(`/enterprise/organizations/${orgId}/members`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Remove a member from an enterprise org
  removeMember: async (orgId, userId) => {
    try {
      const response = await axiosInstance.delete(
        `/enterprise/organizations/${orgId}/members/${userId}`
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // List all explorations across an enterprise org's workspaces
  listExplorations: async (orgId) => {
    try {
      const response = await axiosInstance.get(`/enterprise/organizations/${orgId}/explorations`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};
