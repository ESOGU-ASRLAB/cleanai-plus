import axios from "axios";

// Helper to get auth header
const getAuthHeader = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const API_URL = "http://localhost:8000/api";

const userService = {
  getMe: async () => {
    try {
      const response = await axios.get(`${API_URL}/users/me`, {
        headers: getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateMe: async (userData) => {
    try {
      const response = await axios.put(`${API_URL}/users/me`, userData, {
        headers: getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  uploadAvatar: async (file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post(
        `${API_URL}/users/me/avatar`,
        formData,
        {
          headers: {
            ...getAuthHeader(),
            "Content-Type": "multipart/form-data",
          },
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteAvatar: async () => {
    try {
      const response = await axios.delete(`${API_URL}/users/me/avatar`, {
        headers: getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getStats: async () => {
    try {
      const response = await axios.get(`${API_URL}/users/me/stats`, {
        headers: getAuthHeader(),
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getActivities: async (limit = 10) => {
    try {
      const response = await axios.get(
        `${API_URL}/users/me/activities?limit=${limit}`,
        {
          headers: getAuthHeader(),
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

export default userService;
