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
  }
};
