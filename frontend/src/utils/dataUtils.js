/**
 * Shared data utility functions
 * Used across Statistics and Calendar components
 */

/**
 * Recursively remove null and undefined values from objects and arrays
 * @param {any} obj - Object, array, or primitive value to clean
 * @returns {any} Cleaned value with nulls/undefined removed
 */
export const removeNullValues = (obj) => {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    return obj.map(removeNullValues).filter(item => item !== undefined);
  }
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        const cleanedValue = removeNullValues(value);
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  return obj;
};

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1:30:00" or "45:30")
 */
export const formatDuration = (seconds) => {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Format duration in seconds to short human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1h30m" or "45m")
 */
export const formatDurationShort = (seconds) => {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h${minutes > 0 ? minutes + 'm' : ''}`;
  }
  return `${minutes}m`;
};

/**
 * Format duration in seconds to human-readable string with seconds
 * Used for workout intervals where seconds matter
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1h30m", "45m30s", or "30s")
 */
export const formatDurationWithSeconds = (seconds) => {
  if (!seconds) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h${minutes > 0 ? minutes + 'm' : ''}`;
  if (minutes > 0) return `${minutes}m${secs > 0 ? secs + 's' : ''}`;
  return `${secs}s`;
};

/**
 * Format a date string to ISO date format (YYYY-MM-DD) using local time
 * This matches intervals.icu behavior which uses the user's local timezone
 * @param {Date} date - Date object
 * @returns {string} ISO date string in local time
 */
export const formatDate = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Get current date/time info for AI context
 * Training week starts on Monday
 * @returns {Object} Current date/time information
 */
export const getCurrentDateTime = () => {
  const now = new Date();
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
  return {
    date: now.toLocaleDateString('sv-SE'),
    weekday: weekdays[dayIndex],
    time: now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    trainingWeekStartsOn: 'Monday'
  };
};

/**
 * Format seconds to "Xh Ymin" display (matches calendar weekly totals format)
 * Also accepts decimal hours if isDecimalHours is true
 * @param {number} value - Duration in seconds (or decimal hours if isDecimalHours)
 * @param {boolean} isDecimalHours - If true, treat value as decimal hours
 * @returns {string} Formatted string (e.g., "7h 40min" or "0h 45min")
 */
export const formatHoursMinutes = (value, isDecimalHours = false) => {
  const totalSeconds = isDecimalHours ? Math.round(value * 3600) : Math.round(value || 0);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

export default {
  removeNullValues,
  formatDuration,
  formatDurationShort,
  formatDurationWithSeconds,
  formatHoursMinutes,
  formatDate,
  getCurrentDateTime
};
