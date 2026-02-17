// src/services/omiService.js
import axiosInstance from '../utils/axiosConfig';
import API_CONFIG from '../config/apiConfig';
// import { mockOmiService, isMockEnabled } from './mockOmiService';

const BASE_URL = API_CONFIG.BACKEND_URL || 'http://localhost:8080';

export const omiService = {
  initializeSession: async (orgId) => {
    try {
      const response = await axiosInstance.post(
        `/organizations/${orgId}/omi/session`
      );
      return response.data;
    } catch (error) {
      console.error('Error initializing Omi session:', error);
      throw error.response?.data || error.message;
    }
  },

  sendMessage: async (orgId, sessionId, message, context = {}) => {
    try {
      const payload = {
        message,
        context: {
          page: context.page || 'Unknown',
          route: context.route || window.location.pathname,
          timestamp: new Date().toISOString(),
          ...context, // Include any additional context
        }
      };

      const response = await axiosInstance.post(
        `/organizations/${orgId}/omi/session/${sessionId}/message`,
        payload
      );
      return response.data;
    } catch (error) {
      console.error('Error sending message to Omi:', error);
      throw error.response?.data || error.message;
    }
  },

  chatWithOmi: async (orgId, message, context = {}) => {
    try {
      const payload = {
        message,
        context: {
          page: context.page || 'Unknown',
          route: context.route || window.location.pathname,
          timestamp: new Date().toISOString(),
          ...context,
        }
      };

      const response = await axiosInstance.post(
        `/organizations/${orgId}/omi/chat`,
        payload
      );
      return response.data;
    } catch (error) {
      console.error('Error sending message to Omi:', error);
      throw error.response?.data || error.message;
    }
  },

  getSessionHistory: async (orgId, sessionId) => {
    try {
      const response = await axiosInstance.get(
        `/organizations/${orgId}/omi/session/${sessionId}/history`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching Omi session history:', error);
      throw error.response?.data || error.message;
    }
  },

  endSession: async (orgId, sessionId) => {
    try {
      const response = await axiosInstance.delete(
        `/organizations/${orgId}/omi/session/${sessionId}`
      );
      return response.data;
    } catch (error) {
      console.error('Error ending Omi session:', error);
      throw error.response?.data || error.message;
    }
  },

  getGuidance: async (orgId, stage, userInput) => {
    try {
      const payload = {
        stage,
        user_input: userInput
      };

      const response = await axiosInstance.post(
        `/organizations/${orgId}/omi/guidance`,
        payload
      );
      return response.data;
    } catch (error) {
      console.error('Error getting Omi guidance:', error);
      throw error.response?.data || error.message;
    }
  },

  validate: async (orgId, stage, data) => {
    try {
      const payload = {
        stage,
        data // { name, description, etc. }
      };

      const response = await axiosInstance.post(
        `/organizations/${orgId}/omi/validate`,
        payload
      );
      return response.data;
    } catch (error) {
      console.error('Error validating with Omi:', error);
      throw error.response?.data || error.message;
    }
  },

  updateState: async (orgId, data) => {
    try {
      const response = await axiosInstance.put(
        `/organizations/${orgId}/omi/state`,
        data
      );
      return response.data;
    } catch (error) {
      console.error('Error updating Omi state:', error);
      throw error.response?.data || error.message;
    }
  },

};

export default omiService;
