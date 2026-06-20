// API Configuration for SGEN
// This file configures the backend API URL for different environments

// For local development on the same machine, use relative URL
const WEB_API_URL = '/api';

// For Android/iOS Capacitor app, we need absolute URL to backend
// Update this to match your backend server IP/hostname
// You can also set VITE_API_URL environment variable during build
const CAPACITOR_API_URL = import.meta.env.VITE_API_URL || 'http://YOUR_SERVER_IP:8084/api';

// Detect if running in Capacitor (Android/iOS app)
export const isCapacitor = typeof window !== 'undefined' && 
  (window.location.protocol === 'capacitor:' || 
   window.location.protocol === 'file:' ||
   (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));

// Get the appropriate API base URL
export const getApiBaseUrl = () => {
  if (isCapacitor) {
    return CAPACITOR_API_URL;
  }
  return WEB_API_URL;
};

// Get server base URL for downloads (without /api suffix)
export const getServerBaseUrl = () => {
  if (isCapacitor) {
    // Remove /api or /api/ from the end of CAPACITOR_API_URL
    return CAPACITOR_API_URL.replace(/\/api\/?$/, '');
  }
  // For web, use current origin
  return window.location.origin;
};

// Instructions for updating the backend URL:
// 1. Edit the CAPACITOR_API_URL above, OR
// 2. Set VITE_API_URL environment variable when building:
//    VITE_API_URL=http://YOUR_SERVER_IP:8084/api npm run build
// 3. For permanent config, add to your .env file:
//    VITE_API_URL=http://YOUR_SERVER_IP:8084/api

export default {
  isCapacitor,
  getApiBaseUrl,
  getServerBaseUrl,
  WEB_API_URL,
  CAPACITOR_API_URL
};
