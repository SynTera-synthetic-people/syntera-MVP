import axiosInstance from '../utils/axiosConfig';

export const adminService = {
  getDashboardData: async () => {
    try {
      const response = await axiosInstance.get('/admin');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
  getAdminDashboardData: async (filterType) => {
    try {
      const response = await axiosInstance.get(`/admin/dashboard?filter_type=${filterType}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
  getUsers: async () => {
    try {
      const response = await axiosInstance.get('/admin/users');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
  getUserStats: async (userId) => {
    try {
      const response = await axiosInstance.get(`/admin/users/${userId}/stats`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
  toggleUserStatus: async (userId, isActive) => {
    try {
      const response = await axiosInstance.patch(`/admin/${userId}/active?is_active=${isActive}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // --- User Provisioning & Management ---

  provisionUser: async (payload) => {
    try {
      const response = await axiosInstance.post('/admin/users/provision', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  getUserDetail: async (userId) => {
    try {
      const response = await axiosInstance.get(`/admin/users/${userId}/detail`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  updateUser: async (userId, payload) => {
    try {
      const response = await axiosInstance.put(`/admin/users/${userId}`, payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  deactivateUser: async (userId) => {
    try {
      const response = await axiosInstance.patch(`/admin/users/${userId}/deactivate`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  deleteUser: async (userId) => {
    try {
      await axiosInstance.delete(`/admin/users/${userId}`);
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  resetUserPassword: async (userId) => {
    try {
      const response = await axiosInstance.post(`/admin/users/${userId}/reset-password`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};
