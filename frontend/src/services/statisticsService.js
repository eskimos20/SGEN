import api from '../api/axios';
import { fetchAthleteProfile as fetchAthleteProfileService } from '../utils/fitnessService';

// Statistics API service functions

export const fetchStatisticsData = async (startDate, endDate, fetchCalendarData) => {
  try {
    // Fetch statistics data
    const response = await api.get('/statistics/fetch', {
      params: { startDate, endDate }
    });
    
    // Also fetch calendar data (1 month ahead) for AI analysis
    const today = new Date();
    const oneMonthAhead = new Date(today);
    oneMonthAhead.setMonth(oneMonthAhead.getMonth() + 1);
    const calendarOldest = today.toISOString().split('T')[0];
    const calendarNewest = oneMonthAhead.toISOString().split('T')[0];
    
    // Fetch in background - don't block the UI
    fetchCalendarData(calendarOldest, calendarNewest).catch(() => {});
    
    return response.data;
  } catch (err) {
    throw err;
  }
};

export const fetchAthleteProfile = async (hasConfig) => {
  // Check if user has intervals config first
  if (!hasConfig) {
    return null;
  }

  // Fetch athlete profile using shared service (full response for Statistics page)
  const response = await fetchAthleteProfileService(true);
  return response;
};

export const analyzeData = async (prompt, data, conversationHistory = null) => {
  if (!data || !prompt.trim()) return null;
  
  try {
    const response = await api.post('/statistics/analyze', {
      prompt: prompt,
      data: data,
      conversationHistory: conversationHistory
    });
    
    return response.data.analysis;
  } catch (err) {
    throw err;
  }
};

export const checkOpenAI = async () => {
  try {
    const response = await api.get('/statistics/openai-status');
    return response.data.configured;
  } catch (err) {
    return false;
  }
};

export const fetchCurrentUser = async () => {
  try {
    const response = await api.get('/user/me');
    return response.data;
  } catch (err) {
    throw err;
  }
};

export const fetchActivityDetails = async (activityId) => {
  try {
    const response = await api.get(`/statistics/activity/${activityId}`);
    
    // Fix for axios data access issue
    const data = response.data || response;
    return data;
  } catch (err) {
    throw err;
  }
};

export const fetchPowerCurveHistory = async (oldest, newest, type = 'all') => {
  try {
    const response = await api.get('/statistics/power-curve-history', {
      params: { oldest, newest, type }
    });
    return response.data;
  } catch (err) {
    throw err;
  }
};
