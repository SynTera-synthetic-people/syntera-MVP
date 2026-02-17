// services/interviewService.js
import axiosInstance from '../utils/axiosConfig';

export const interviewService = {
  // Start a new interview
  startInterview: async (workspaceId, explorationId, personaId) => {
    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews`,
      { persona_id: personaId }
    );
    return response.data;
  },

  // Get interview by ID
  getInterview: async (workspaceId, explorationId, interviewId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/${interviewId}`
    );
    return response.data;
  },

  // Get all interviews for exploration
  getInterviews: async (workspaceId, explorationId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews`
    );
    return response.data;
  },

  // Send a message in interview
  // sendMessage: async (workspaceId, explorationId, interviewId, message) => {
  //   console.log("ropr28tx11f09ok4taj => ", message);
  //   const response = await axiosInstance.post(
  //     `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/${interviewId}/messages`,
  //     message
  //   );
  //   return response.data;
  // },

  sendMessage: async (workspaceId, explorationId, interviewId, message) => {
    console.log("send message => ", message);

    const formData = new URLSearchParams();
    formData.append('role', message.role);
    formData.append('text', message.text);

    const response = await axiosInstance.post(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/${interviewId}/messages`,
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data;
  },

  // Get interview insights
  getInterviewInsights: async (workspaceId, explorationId, interviewId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/${interviewId}/insights`
    );
    return response.data;
  },

  // Delete interview
  deleteInterview: async (workspaceId, explorationId, interviewId) => {
    const response = await axiosInstance.delete(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/${interviewId}`
    );
    return response.data;
  },
  exportInterviewReport: async (workspaceId, explorationId, interviewId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/${interviewId}/export`,
      {
        responseType: 'blob', // Important for file downloads
      }
    );
    return response.data;
  },
  getInterviewPreview: async (workspaceId, explorationId, interviewId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/${interviewId}/preview`
    );
    return response.data;
  },
  getAllInterviewPreview: async (workspaceId, explorationId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/preview`
    );
    return response.data;
  },
  exportAllInterviewsPdf: async (workspaceId, explorationId) => {
    const response = await axiosInstance.get(
      `/workspaces/${workspaceId}/explorations/${explorationId}/in-depth/interviews/export`,
      {
        responseType: 'blob', // Important for file downloads
      }
    );
    return response.data;
  },
};