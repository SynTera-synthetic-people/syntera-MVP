import axiosInstance from '../utils/axiosConfig';

export const authService = {
  login: async (credentials) => {
    try {
      const response = await axiosInstance.post('/auth/login', credentials);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Change password for authenticated user — clears must_change_password flag on success
  changePassword: async ({ current_password, new_password, confirm_password }) => {
    try {
      const response = await axiosInstance.patch('/auth/change-password', {
        current_password,
        new_password,
        confirm_password,
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Fetch current user's full profile (includes trial fields)
  fetchMe: async () => {
    try {
      const response = await axiosInstance.get('/auth/me');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
};