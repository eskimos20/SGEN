/**
 * Shared athlete utility functions
 * Used for age calculations, volume thresholds, and athlete data processing
 */
import { getSportInfo } from './sportTypeUtils';

/**
 * Calculate age from date of birth
 * @param {string} dateOfBirth - Date of birth in ISO format (YYYY-MM-DD)
 * @returns {number|null} Age in years, or null if invalid date
 */
export const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

/**
 * Get training volume color based on hours and age
 * @param {number} hours - Training hours
 * @param {number} age - Athlete age (defaults to 35)
 * @returns {string} Hex color code
 */
export const getVolumeColor = (hours, age = 35) => {
  const thresholds = getVolumeThresholds(age);
  
  if (hours < thresholds.low) return '#9ca3af'; // gray - low
  if (hours < thresholds.moderate) return '#10b981'; // green - moderate
  if (hours < thresholds.high) return '#f59e0b'; // amber - high
  return '#ef4444'; // red - extreme
};

/**
 * Get volume thresholds based on age
 * @param {number} age - Athlete age
 * @returns {Object} Thresholds { low, moderate, high }
 */
export const getVolumeThresholds = (age) => {
  if (age < 36) {
    return { low: 6, moderate: 12, high: 18 };
  } else if (age < 51) {
    return { low: 5, moderate: 10, high: 15 };
  } else if (age < 66) {
    return { low: 4, moderate: 8, high: 12 };
  } else {
    return { low: 3, moderate: 6, high: 9 };
  }
};

/**
 * Get age group label and threshold descriptions
 * @param {number} age - Athlete age
 * @returns {Object} Age group info with labels
 */
export const getAgeGroupInfo = (age) => {
  if (!age) {
    return {
      ageGroup: '18-35 years',
      lowThreshold: 'under 6 hours',
      moderateThreshold: '6-12 hours',
      highThreshold: '12-18 hours',
      extremeThreshold: 'over 18 hours'
    };
  }
  
  if (age < 36) {
    return {
      ageGroup: '18-35 years',
      lowThreshold: 'under 6 hours',
      moderateThreshold: '6-12 hours',
      highThreshold: '12-18 hours',
      extremeThreshold: 'over 18 hours'
    };
  } else if (age < 51) {
    return {
      ageGroup: '36-50 years',
      lowThreshold: 'under 5 hours',
      moderateThreshold: '5-10 hours',
      highThreshold: '10-15 hours',
      extremeThreshold: 'over 15 hours'
    };
  } else if (age < 66) {
    return {
      ageGroup: '51-65 years',
      lowThreshold: 'under 4 hours',
      moderateThreshold: '4-8 hours',
      highThreshold: '8-12 hours',
      extremeThreshold: 'over 12 hours'
    };
  } else {
    return {
      ageGroup: '65+ years',
      lowThreshold: 'under 3 hours',
      moderateThreshold: '3-6 hours',
      highThreshold: '6-9 hours',
      extremeThreshold: 'over 9 hours'
    };
  }
};

/**
 * Extract sport settings with zones for different activity types
 * @param {Object} athlete - Athlete object from API
 * @returns {Array} Sport settings array with zones
 */
export const extractSportSettings = (athlete) => {
  if (!athlete?.sportSettings) return [];
  
  return athlete.sportSettings.map(settings => ({
    types: settings.types,
    ftp: settings.ftp,
    lthr: settings.lthr,
    maxHr: settings.max_hr,
    hrZones: settings.hr_zones,
    powerZones: settings.power_zones
  }));
};

/**
 * Map sport types to friendly category names with icons.
 * Delegates to getSportInfo from sportTypeUtils for a complete Intervals.icu type mapping.
 * @param {Array|string} types - Array of sport types (or single string for legacy callers)
 * @returns {Object|null} Category info { name, icon, color } or null
 */
export const getSportCategory = (types) => {
  const typeArr = Array.isArray(types) ? types : (types ? [types] : []);
  if (typeArr.length === 0) return null;
  const firstType = typeArr[0];
  if (!firstType || firstType.toLowerCase() === 'other') return null;
  const info = getSportInfo(firstType);
  return { name: info.name, icon: info.emoji, color: info.color };
};

/**
 * Get color classes for sport category cards
 * @param {string} color - Color name
 * @returns {string} Tailwind CSS classes
 */
export const getSportColorClasses = (color) => {
  const colorClasses = {
    blue:   'from-blue-50 to-blue-100 border-blue-200',
    green:  'from-green-50 to-green-100 border-green-200',
    cyan:   'from-cyan-50 to-cyan-100 border-cyan-200',
    indigo: 'from-indigo-50 to-indigo-100 border-indigo-200',
    amber:  'from-amber-50 to-amber-100 border-amber-200',
    gray:   'from-gray-50 to-gray-100 border-gray-200',
    purple: 'from-purple-50 to-purple-100 border-purple-200',
    yellow: 'from-yellow-50 to-yellow-100 border-yellow-200',
    orange: 'from-orange-50 to-orange-100 border-orange-200',
  };
  return colorClasses[color] || colorClasses.gray;
};

export default {
  calculateAge,
  getVolumeColor,
  getVolumeThresholds,
  getAgeGroupInfo,
  extractSportSettings,
  getSportCategory,
  getSportColorClasses
};
