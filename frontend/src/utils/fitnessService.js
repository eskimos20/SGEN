import api from '../api/axios';

/**
 * Shared service for fetching fitness, wellness, and athlete profile data
 * Used by Statistics, Calendar AI Scheduler, and other components
 */

// Use local date to match intervals.icu behavior
const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Fetch athlete profile with sport settings
 * @param {boolean} fullResponse - If true, returns the full API response
 * @returns {Object} Profile data with athlete, sportSettings, ftp, weight
 */
export const fetchAthleteProfile = async (fullResponse = false) => {
  try {
    const response = await api.get('/statistics/athlete-profile');
    
    if (fullResponse) {
      return response.data;
    }
    
    const profile = response.data || {};
    const athlete = profile.athlete || {};
    const sportSettings = Array.isArray(profile.sportSettings) ? profile.sportSettings : [];
    const cyclingSettings = sportSettings.find(s => s.types?.includes('Ride')) || sportSettings[0] || {};
    const runningSettings = sportSettings.find(s => s.types?.includes('Run')) || {};
    
    return {
      athlete,
      sportSettings,
      cyclingSettings,
      runningSettings,
      ftp: cyclingSettings.ftp || athlete.ftp || null,
      runningFtp: runningSettings.ftp || null,
      weight: athlete.weight || null
    };
  } catch (err) {
    return fullResponse ? null : { athlete: {}, sportSettings: [], cyclingSettings: {}, runningSettings: {}, ftp: null, runningFtp: null, weight: null };
  }
};

/**
 * Fetch wellness data for a date range
 * @param {string} oldest - Start date (YYYY-MM-DD)
 * @param {string} newest - End date (YYYY-MM-DD)
 * @returns {Array} Wellness entries with ctl, atl, hrv, sleep, etc.
 */
/**
 * Update athlete profile information
 * @param {Object} updates - Profile updates (weight, height, etc.)
 * @returns {Object} Updated profile data
 */
export const updateAthleteProfile = async (updates) => {
  try {
    const response = await api.put('/statistics/athlete/profile', updates);
    return response.data;
  } catch (error) {
    console.error('Failed to update athlete profile:', error);
    throw error;
  }
};

/**
 * Update athlete settings (HR zones, power zones, etc.)
 * @param {Object} updates - Settings updates
 * @returns {Object} Updated settings data
 */
export const updateAthleteSettings = async (updates) => {
  try {
    const response = await api.put('/statistics/athlete/settings', updates);
    return response.data;
  } catch (error) {
    console.error('Failed to update athlete settings:', error);
    throw error;
  }
};

/**
 * Update athlete sport settings (FTP, LTHR, etc. per sport)
 * @param {Object} updates - Sport settings updates
 * @returns {Object} Updated sport settings data
 */
export const updateAthleteSportSettings = async (updates) => {
  try {
    const response = await api.put('/statistics/athlete/sport-settings', updates);
    return response.data;
  } catch (error) {
    console.error('Failed to update athlete sport settings:', error);
    throw error;
  }
};

/**
 * Update wellness data (weight, resting HR, HRV, etc.)
 * @param {Array} updates - Array of wellness data objects
 * @returns {Object} Updated wellness data
 */
export const updateWellnessData = async (updates) => {
  try {
    const response = await api.put('/statistics/wellness/bulk', updates);
    return response.data;
  } catch (error) {
    console.error('Failed to update wellness data:', error);
    throw error;
  }
};

/**
 * Fetch available activity types from Intervals.icu OpenAPI spec
 * @returns {Array} List of activity type strings (e.g. ['Ride', 'Run', 'Swim', ...])
 */
export const fetchAvailableActivityTypes = async () => {
  try {
    const response = await api.get('/statistics/sport-types');
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Failed to fetch available activity types:', error);
    return [];
  }
};

/**
 * Create a new sport setting on Intervals.icu
 * @param {Object} sportData - Sport data with types array (e.g. { types: ["Badminton"] })
 * @returns {Object} Created sport settings
 */
export const createAthleteSportSettings = async (sportData) => {
  try {
    const response = await api.post('/statistics/athlete/sport-settings', sportData);
    return response.data;
  } catch (error) {
    console.error('Failed to create athlete sport settings:', error);
    throw error;
  }
};

/**
 * Fetch activities matching a sport settings entry (for count preview)
 * @param {number} sportId - The sport settings ID
 * @returns {Array} Array of matching ActivityMini objects
 */
export const fetchMatchingActivities = async (sportId) => {
  try {
    const response = await api.get(`/statistics/athlete/sport-settings/${sportId}/matching-activities`);
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Failed to fetch matching activities:', error);
    throw error;
  }
};

/**
 * Apply sport settings to all matching activities (updates zones/FTP etc.)
 * Runs asynchronously on Intervals.icu side.
 * @param {number} sportId - The sport settings ID
 * @returns {Object} Response from Intervals.icu
 */
export const applySettingsToActivities = async (sportId) => {
  try {
    const response = await api.put(`/statistics/athlete/sport-settings/${sportId}/apply`);
    return response.data;
  } catch (error) {
    console.error('Failed to apply sport settings to activities:', error);
    throw error;
  }
};

/**
 * Delete a sport setting from Intervals.icu
 * @param {number} sportId - The sport settings ID to delete
 */
export const deleteAthleteSportSettings = async (sportId) => {
  try {
    await api.delete(`/statistics/athlete/sport-settings/${sportId}`);
  } catch (error) {
    console.error('Failed to delete athlete sport settings:', error);
    throw error;
  }
};

export const fetchWellnessData = async (oldest, newest) => {
  try {
    const response = await api.get(`/statistics/wellness?oldest=${oldest}&newest=${newest}`);
    return response.data || [];
  } catch (err) {
    return [];
  }
};

/**
 * Get latest fitness values (CTL, ATL, TSB) from wellness data
 * Only considers entries up to today (not future planned data)
 * @param {Array} wellnessData - Array of wellness entries
 * @returns {Object} { ctl, atl, tsb }
 */
export const getLatestFitness = (wellnessData) => {
  if (!wellnessData || wellnessData.length === 0) {
    return { ctl: null, atl: null, tsb: null };
  }

  // Use local date to match intervals.icu behavior
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Filter to only past/today entries with valid CTL/ATL, then sort ascending
  const validEntries = wellnessData
    .filter(w => {
      const entryDate = w.id || '';
      return entryDate <= today && (w.ctl !== undefined && w.ctl !== null);
    })
    .sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  // Get today's entry or the most recent
  const todayEntry = validEntries.find(w => w.id === today);
  const latest = todayEntry || (validEntries.length > 0 ? validEntries[validEntries.length - 1] : null);
  
  if (!latest) {
    return { ctl: null, atl: null, tsb: null };
  }

  const ctl = latest.ctl ?? null;
  const atl = latest.atl ?? null;
  const tsb = (ctl !== null && atl !== null) ? (ctl - atl) : null;

  return { ctl, atl, tsb };
};

/**
 * Fetch calendar events (planned workouts)
 * @param {string} oldest - Start date (YYYY-MM-DD)
 * @param {string} newest - End date (YYYY-MM-DD)
 * @returns {Array} Planned events
 */
export const fetchCalendarEvents = async (oldest, newest) => {
  try {
    const response = await api.get(`/statistics/calendar?oldest=${oldest}&newest=${newest}`);
    return Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    return [];
  }
};

/**
 * Fetch calendar activities (completed workouts)
 * @param {string} oldest - Start date (YYYY-MM-DD)
 * @param {string} newest - End date (YYYY-MM-DD)
 * @returns {Array} Completed activities
 */
export const fetchCalendarActivities = async (oldest, newest) => {
  try {
    const response = await api.get(`/statistics/calendar/activities?oldest=${oldest}&newest=${newest}`);
    return Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    return [];
  }
};

/**
 * Fetch all data needed for AI Scheduler
 * @returns {Object} { events, activities, wellness, fitness }
 */
export const fetchSchedulerData = async () => {
  try {
    const today = new Date();
    
    // Get wellness days from user preference (same as Statistics page)
    const wellnessDays = parseInt(localStorage.getItem('statistics-wellnessDays') || '30', 10);
    
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const threeMonthsAhead = new Date();
    threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);

    const historyOldest = formatDate(oneMonthAgo);
    const futureNewest = formatDate(threeMonthsAhead);
    const todayStr = formatDate(today);
    
    // Calculate wellness date range based on user preference
    const wellnessStartDate = new Date();
    wellnessStartDate.setDate(wellnessStartDate.getDate() - wellnessDays);
    const wellnessOldest = formatDate(wellnessStartDate);

    const [events, activities, wellness, profile] = await Promise.all([
      fetchCalendarEvents(todayStr, futureNewest),
      fetchCalendarActivities(historyOldest, todayStr),
      fetchWellnessData(wellnessOldest, todayStr), // Use user's wellness days preference
      fetchAthleteProfile()
    ]);

    const latestFitness = getLatestFitness(wellness);

    return {
      events,
      activities,
      wellness,
      fitness: {
        ...latestFitness,
        ftp: profile?.ftp || null,
        runningFtp: profile?.runningFtp || null,
        weight: profile?.weight || null
      }
    };
  } catch (err) {
    return {
      events: [],
      activities: [],
      wellness: [],
      fitness: { ctl: null, atl: null, tsb: null, ftp: null, runningFtp: null, weight: null }
    };
  }
};

export default {
  fetchAthleteProfile,
  fetchWellnessData,
  fetchCalendarEvents,
  fetchCalendarActivities,
  fetchSchedulerData,
  getLatestFitness,
  updateAthleteProfile,
  updateAthleteSettings,
  updateAthleteSportSettings,
  createAthleteSportSettings,
  deleteAthleteSportSettings,
  fetchAvailableActivityTypes,
  fetchMatchingActivities,
  applySettingsToActivities
};
