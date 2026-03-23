import axios from 'axios';
import API_CONFIG from '../config/apiConfig';

// const BASE_URL = API_CONFIG.BACKEND_URL || 'http://localhost:8000';
const BASE_URL = API_CONFIG.BACKEND_URL || 'http://localhost:8080';

export const authService = {
  login: async (credentials) => {
    try {
      const response = await axios.post(`${BASE_URL}/auth/login`, credentials);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // You can add other auth-related API calls
  // register: async (userData) => {...},
  // logout: async () => {...},
  // refreshToken: async () => {...},
};