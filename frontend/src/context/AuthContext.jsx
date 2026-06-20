import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { initToken, setToken, removeToken } from '../services/tokenService.js';
import { isCapacitor } from '../config/api.config.js';

const AuthContext = createContext(null);

// Parse JWT token to get expiration time
const parseJwt = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

// Check if token is expired
const isTokenExpired = (token) => {
  if (!token) return true;
  const decoded = parseJwt(token);
  if (!decoded || !decoded.exp) return true;
  // Add 10 second buffer to avoid edge cases
  return decoded.exp * 1000 < Date.now() + 10000;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasIntervalsConfig, setHasIntervalsConfig] = useState(false);

  const clearAuth = useCallback(async () => {
    await removeToken();
    setUser(null);
  }, []);

  // Check token validity
  const checkTokenValidity = useCallback(async () => {
    const token = await initToken(); // Get fresh token from storage
    if (token && isTokenExpired(token)) {
      await clearAuth();
      window.location.href = '/login';
      return false;
    }
    return true;
  }, [clearAuth]);

  useEffect(() => {
    const initAuth = async () => {
      const token = await initToken(); // Initialize token from storage
      
      // Check if token exists and is valid
      if (token && !isTokenExpired(token)) {
        // Fetch user data from API - no localStorage caching
        const fetchUserData = async () => {
          try {
            const userResponse = await api.get('/user/me');
            setUser(userResponse.data);
            setHasIntervalsConfig(userResponse.data.hasIntervalsConfig || false);
          } catch (err) {
            setHasIntervalsConfig(false);
            await clearAuth();
          } finally {
            // Only set loading to false after we have fetched user data
            setLoading(false);
          }
        };
        fetchUserData();
      } else if (token && isTokenExpired(token)) {
        await clearAuth();
        setLoading(false);
      } else {
        setLoading(false);
      }
    };
    initAuth();
  }, [clearAuth]);

  // Periodically check token validity (every 60 seconds)
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      checkTokenValidity();
    }, 60000);

    return () => clearInterval(interval);
  }, [user, checkTokenValidity]);

  // Listen for user updates from Profile page
  useEffect(() => {
    const handleUserUpdate = (event) => {
      if (event.detail) {
        setUser(event.detail);
        setHasIntervalsConfig(event.detail.hasIntervalsConfig || false);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdate);
    return () => window.removeEventListener('userUpdated', handleUserUpdate);
  }, []);

  const login = async (username, password) => {
    const clientType = isCapacitor ? 'mobile' : 'web';
    const response = await api.post('/auth/login', { username, password, clientType });
    const loginData = response.data;
    
    // Save token persistently (Preferences for Android, localStorage for web)
    await setToken(loginData.token);
    
    // Fetch full user data from /user/me to get hasIntervalsConfig
    try {
      const userResponse = await api.get('/user/me');
      setUser(userResponse.data);
      setHasIntervalsConfig(userResponse.data.hasIntervalsConfig || false);
    } catch (err) {
      // Fallback: set basic user data from login response
      setUser({
        username: loginData.username,
        role: loginData.role,
        mustChangePassword: loginData.mustChangePassword
      });
      setHasIntervalsConfig(false);
    }
    
    return loginData;
  };

  const logout = async () => {
    await removeToken();
    setUser(null);
    window.location.href = '/login';
  };

  const changePassword = async (currentPassword, newPassword) => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
    logout();
  };

  const updateUser = (userData) => {
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, changePassword, updateUser, loading, hasIntervalsConfig, setHasIntervalsConfig }}>
      {children}
    </AuthContext.Provider>
  );
};
