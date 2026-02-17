// src/utils/api.js
import axios from "axios";
import API_CONFIG from "../config/apiConfig";

const BASE_URL = API_CONFIG.BACKEND_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL: BASE_URL,
});

// ==================== AUTHENTICATION ENDPOINTS ====================
export const loginUser = async (data) => {
  return await api.post(`/auth/login`, data);
};

export const signupUser = async (data) => {
  return await api.post(`/auth/signup`, data);
};

export const sendResetEmail = async (data) => {
  return await api.post(`/auth/forgot-password`, data);
};

export const resetPassword = async (token, data) => {
  return await api.post(`/auth/reset-password/${token}`, data);
};

// ==================== ORGANIZATION ENDPOINTS ====================
export const getOrganizations = async (orgId) => {
  return await api.get(`/organizations/${orgId}`);
};

export const getOrganization = async () => {
  return await api.get(`/orgs`);
};

export const updateOrganization = async (orgId, data) => {
  return await api.put(`/organizations/${orgId}`, data);
};

export const getOrganizationMembers = async (orgId) => {
  return await api.get(`/organizations/${orgId}/members`);
};

export const addOrganizationMember = async (orgId, data) => {
  return await api.post(`/organizations/${orgId}/members`, data);
};

export const removeOrganizationMember = async (orgId, userId) => {
  return await api.delete(`/organizations/${orgId}/members/${userId}`);
};

// ==================== WORKSPACE ENDPOINTS ====================
export const getWorkspaces = async (orgId) => {
  return await api.get(`/organizations/${orgId}/workspaces`);
};

export const getWorkspace = async (workspaceId) => {
  return await api.get(`/workspaces/${workspaceId}`);
};

export const createWorkspace = async (orgId, data) => {
  return await api.post(`/organizations/${orgId}/workspaces`, data);
};

export const updateWorkspace = async (workspaceId, data) => {
  return await api.put(`/workspaces/${workspaceId}`, data);
};

export const deleteWorkspace = async (workspaceId) => {
  return await api.delete(`/workspaces/${workspaceId}`);
};

export const getWorkspaceUsers = async (workspaceId) => {
  return await api.get(`/workspaces/${workspaceId}/users`);
};

export const addWorkspaceUser = async (workspaceId, data) => {
  return await api.post(`/workspaces/${workspaceId}/users`, data);
};

export const removeWorkspaceUser = async (workspaceId, userId) => {
  return await api.delete(`/workspaces/${workspaceId}/users/${userId}`);
};

// ==================== RESEARCH OBJECTIVES ENDPOINTS ====================
export const getResearchObjectives = async (workspaceId) => {
  return await api.get(`/workspaces/${workspaceId}/research-objectives`);
};

export const getResearchObjective = async (objectiveId) => {
  return await api.get(`/research-objectives/${objectiveId}`);
};

export const createResearchObjective = async (workspaceId, data) => {
  return await api.post(`/workspaces/${workspaceId}/research-objectives`, data);
};

export const updateResearchObjective = async (objectiveId, data) => {
  return await api.put(`/research-objectives/${objectiveId}`, data);
};

export const deleteResearchObjective = async (objectiveId) => {
  return await api.delete(`/research-objectives/${objectiveId}`);
};

// ==================== PERSONAS ENDPOINTS ====================
export const getPersonas = async (objectiveId) => {
  return await api.get(`/research-objectives/${objectiveId}/personas`);
};

export const createPersona = async (objectiveId, data) => {
  return await api.post(`/research-objectives/${objectiveId}/personas`, data);
};

export const updatePersona = async (personaId, data) => {
  return await api.put(`/personas/${personaId}`, data);
};

export const deletePersona = async (personaId) => {
  return await api.delete(`/personas/${personaId}`);
};

// ==================== DEMOGRAPHICS ENDPOINTS ====================
export const getDemographics = async (personaId) => {
  return await api.get(`/personas/${personaId}/demographics`);
};

export const updateDemographics = async (personaId, data) => {
  return await api.put(`/personas/${personaId}/demographics`, data);
};

// ==================== TRAITS ENDPOINTS ====================
export const getPsychographicTraits = async (personaId) => {
  return await api.get(`/personas/${personaId}/psychographic-traits`);
};

export const updatePsychographicTraits = async (personaId, data) => {
  return await api.put(`/personas/${personaId}/psychographic-traits`, data);
};

export const getBehavioralTraits = async (personaId) => {
  return await api.get(`/personas/${personaId}/behavioral-traits`);
};

export const updateBehavioralTraits = async (personaId, data) => {
  return await api.put(`/personas/${personaId}/behavioral-traits`, data);
};

// ==================== QUESTIONNAIRE ENDPOINTS ====================
export const getQuestionnaires = async (objectiveId) => {
  return await api.get(`/research-objectives/${objectiveId}/questionnaires`);
};

export const createQuestionnaire = async (objectiveId, data) => {
  return await api.post(`/research-objectives/${objectiveId}/questionnaires`, data);
};

export const updateQuestionnaire = async (questionnaireId, data) => {
  return await api.put(`/questionnaires/${questionnaireId}`, data);
};

export const deleteQuestionnaire = async (questionnaireId) => {
  return await api.delete(`/questionnaires/${questionnaireId}`);
};

// ==================== SURVEY RESULTS ENDPOINTS ====================
export const getSurveyResults = async (objectiveId) => {
  return await api.get(`/research-objectives/${objectiveId}/survey-results`);
};

export const submitSurveyResult = async (objectiveId, data) => {
  return await api.post(`/research-objectives/${objectiveId}/survey-results`, data);
};

export const getSurveyResult = async (resultId) => {
  return await api.get(`/survey-results/${resultId}`);
};

// ==================== OMI AI COPILOT ENDPOINTS ====================
export const initializeOmiSession = async (orgId) => {
  return await api.post(`/organizations/${orgId}/omi/session`);
};

export const sendOmiMessage = async (orgId, sessionId, message, context = {}) => {
  return await api.post(`/organizations/${orgId}/omi/session/${sessionId}/message`, {
    message,
    context: {
      page: context.page || 'Unknown',
      route: context.route || window.location.pathname,
      timestamp: new Date().toISOString(),
      ...context,
    }
  });
};

export const getOmiSessionHistory = async (orgId, sessionId) => {
  return await api.get(`/organizations/${orgId}/omi/session/${sessionId}/history`);
};

export const endOmiSession = async (orgId, sessionId) => {
  return await api.delete(`/organizations/${orgId}/omi/session/${sessionId}`);
};

export const updateOmiState = async (orgId, data) => {
  return await api.put(`/organizations/${orgId}/omi/state`, data);
};

export const chatWithOmi = async (orgId, message, context = {}) => {
  return await api.post(`/organizations/${orgId}/omi/chat`, {
    message,
    context: {
      page: context.page || 'Unknown',
      route: context.route || window.location.pathname,
      timestamp: new Date().toISOString(),
      ...context,
    }
  });
};

export const getOmiGuidance = async (orgId, data) => {
  return await api.post(`/organizations/${orgId}/omi/guidance`, data);
};

export const validateOmi = async (orgId, data) => {
  return await api.post(`/organizations/${orgId}/omi/validate`, data);
};

// ==================== FILE UPLOAD ENDPOINTS ====================
export const uploadFile = async (objectiveId, formData) => {
  return await api.post(`/research-objectives/${objectiveId}/upload`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
};

// ==================== UTILITY FUNCTIONS ====================
// Add auth token to headers
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
};

// Error handling utility
export const handleApiError = (error) => {
  if (error.response) {
    return {
      message: error.response.data?.message || error.response.statusText,
      status: error.response.status,
      data: error.response.data
    };
  } else if (error.request) {
    return {
      message: "No response from server. Please check your connection.",
      status: null,
      data: null
    };
  } else {
    return {
      message: error.message || "An error occurred",
      status: null,
      data: null
    };
  }
};

export default api;
