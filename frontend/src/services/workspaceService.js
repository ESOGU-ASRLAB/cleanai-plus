import axios from "axios";

const API_URL = "http://localhost:8000/api";

const workspaceService = {
  searchPublic: async (q = "", limit = 8) => {
    const response = await axios.get(`${API_URL}/workspaces/public/search`, {
      params: { q, limit },
    });
    return response.data;
  },
};

export default workspaceService;
