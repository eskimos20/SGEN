import { Preferences } from '@capacitor/preferences';
import { isCapacitor } from '../config/api.config.js';

// In-memory token cache (for synchronous access in axios interceptor)
let cachedToken = null;

// Initialize token from storage
export const initToken = async () => {
  if (isCapacitor) {
    const { value } = await Preferences.get({ key: 'token' });
    cachedToken = value;
    return value;
  }
  cachedToken = localStorage.getItem('token');
  return cachedToken;
};

// Get token (synchronous - for axios interceptor)
export const getToken = () => {
  return cachedToken;
};

// Set token
export const setToken = async (token) => {
  cachedToken = token;
  if (isCapacitor) {
    await Preferences.set({ key: 'token', value: token });
  } else {
    localStorage.setItem('token', token);
  }
};

// Remove token
export const removeToken = async () => {
  cachedToken = null;
  if (isCapacitor) {
    await Preferences.remove({ key: 'token' });
    await Preferences.remove({ key: 'user' });
  } else {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
  localStorage.removeItem('athleteProfile');
};
