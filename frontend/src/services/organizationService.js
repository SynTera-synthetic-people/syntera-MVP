import axios from 'axios';
import API_CONFIG from '../config/apiConfig';
import axiosInstance from '../utils/axiosConfig';

// const BASE_URL = API_CONFIG.BACKEND_URL || 'http://localhost:8000';
const BASE_URL = API_CONFIG.BACKEND_URL || 'http://localhost:8080';

export const organizationService = {
  getOrganizations: async () => {
    try {
      const response = await axiosInstance.get(`/orgs`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // You can add more organization-related API calls here
  // createOrganization: async (data) => {...},
  // updateOrganization: async (id, data) => {...},
  // deleteOrganization: async (id) => {...},
};