import axios from 'axios';
import { getApiBaseUrl } from '../config/api.config.js';
import { getToken, removeToken } from '../services/tokenService.js';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: false, // We use JWT tokens, not cookies
  timeout: 120000, // 120 second timeout for large data fetches
});

api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Set Content-Type to application/json for non-FormData requests
    if (config.data && !(config.data instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      await removeToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
