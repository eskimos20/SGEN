import { DEFAULT_HR_ZONES } from './zoneUtils';

/**
 * Nutrition utility functions
 * BMR/TDEE calculations, macro recommendations, and calorie conversions
 */

/**
 * Get kcal burned for a completed activity.
 * Prefers the direct 'calories' field from intervals.icu (total metabolic calories).
 * Falls back to converting icu_joules (mechanical work) with ~25% efficiency.
 * @param {Object} activity - Activity object with calories and/or icu_joules
 * @returns {number} Estimated total kcal burned
 */
export const getActivityKcal = (activity) => {
  if (!activity) return 0;
  // Prefer direct calories field from intervals.icu
  if (activity.calories && activity.calories > 0) {
    return Math.round(activity.calories);
  }
  // Fallback: convert mechanical work (icu_joules) with ~25% efficiency
  if (activity.icu_joules && activity.icu_joules > 0) {
    return Math.round((activity.icu_joules / 0.25) / 4184);
  }
  return 0;
};

/**
 * Legacy helper — convert raw joules to kcal with efficiency factor.
 * Prefer getActivityKcal(activity) when you have the full activity object.
 * @param {number} joules - Mechanical energy in joules
 * @returns {number} Estimated total kcal burned
 */
export const joulesToKcal = (joules) => {
  if (!joules || joules <= 0) return 0;
  return Math.round((joules / 0.25) / 4184);
};

/**
 * Convert workout kJ (mechanical work) to estimated total kcal burned
 * Assumes ~25% mechanical efficiency (typical for cycling/running)
 * @param {number} kj - Mechanical work in kJ
 * @returns {number} Estimated total kcal burned
 */
export const workKjToKcal = (kj) => {
  if (!kj || kj <= 0) return 0;
  return Math.round((kj / 0.25) / 4.184);
};

/**
 * Calculate BMR using Mifflin-St Jeor equation
 * @param {number} weightKg - Weight in kg
 * @param {number} heightCm - Height in cm
 * @param {number} age - Age in years
 * @param {string} sex - 'male' or 'female'
 * @returns {number} BMR in kcal/day
 */
export const calculateBMR = (weightKg, heightCm, age, sex) => {
  if (!weightKg || !heightCm || !age) return 0;
  
  // Mifflin-St Jeor
  const base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
  return Math.round(sex === 'female' ? base - 161 : base + 5);
};

/**
 * Activity level multipliers (PAL - Physical Activity Level)
 */
export const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary', description: 'Little or no exercise', factor: 1.2 },
  { key: 'light', label: 'Lightly Active', description: 'Light exercise 1-3 days/week', factor: 1.375 },
  { key: 'moderate', label: 'Moderately Active', description: 'Moderate exercise 3-5 days/week', factor: 1.55 },
  { key: 'active', label: 'Very Active', description: 'Hard exercise 6-7 days/week', factor: 1.725 },
  { key: 'extreme', label: 'Extremely Active', description: 'Very hard exercise & physical job', factor: 1.9 },
];

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 * @param {number} bmr - Basal Metabolic Rate
 * @param {string} activityLevel - Activity level key
 * @returns {number} TDEE in kcal/day
 */
export const calculateTDEE = (bmr, activityLevel = 'moderate') => {
  if (!bmr) return 0;
  const level = ACTIVITY_LEVELS.find(l => l.key === activityLevel);
  const factor = level ? level.factor : 1.55;
  return Math.round(bmr * factor);
};

/**
 * Estimate activity level from weekly training hours
 * @param {number} weeklyHours - Total training hours per week
 * @returns {string} Activity level key
 */
export const estimateActivityLevel = (weeklyHours) => {
  if (!weeklyHours || weeklyHours <= 0) return 'sedentary';
  if (weeklyHours < 3) return 'light';
  if (weeklyHours < 6) return 'moderate';
  if (weeklyHours < 10) return 'active';
  return 'extreme';
};

/**
 * Calculate macro recommendations for a workout
 * @param {number} workoutKcal - Calories burned during workout
 * @param {number} weightKg - Athlete weight in kg
 * @param {number} durationMinutes - Workout duration in minutes
 * @param {string} workoutType - 'endurance', 'interval', or 'strength'
 * @param {number|null} intensityFactor - Optional 0-1 scale (0=light, 0.5=moderate, 1=hard). When provided, continuously scales carb rates instead of using the binary isHigh flag.
 * @returns {Object} Macro recommendations
 */
/**
 * Calculate macro recommendations for a workout
 * @param {number} workoutKcal - Calories burned during workout
 * @param {number} weightKg - Athlete weight in kg
 * @param {number} durationMinutes - Workout duration in minutes
 * @param {string} workoutType - 'endurance', 'interval', or 'strength'
 * @param {number|null} intensityFactor - Optional 0-1 scale (0=light, 0.5=moderate, 1=hard). When provided, continuously scales carb rates instead of using the binary isHigh flag.
 * @returns {Object} Macro recommendations
 */
export const calculateWorkoutMacros = (workoutKcal, weightKg, durationMinutes, workoutType = 'endurance', intensityFactor = null) => {
  if (!workoutKcal || !weightKg) return null;

  const durationHours = (durationMinutes || 60) / 60;
  const isHigh = workoutType === 'interval';
  const iF = intensityFactor !== null ? Math.min(1, Math.max(0, intensityFactor)) : (isHigh ? 1.0 : 0.0);

  // During-workout fueling: scale with intensity, nothing needed for short/easy sessions
  let carbsDuringTotal = 0;
  if (durationMinutes >= 45) {
    const maxRate = durationMinutes <= 60 ? 45
      : durationMinutes <= 120 ? 70
      : 85;
    const baseRate = durationMinutes <= 60 ? 0
      : durationMinutes <= 120 ? 30
      : 40;
    const rate = Math.round(baseRate + (maxRate - baseRate) * iF);
    const fuelingHours = (durationMinutes - 15) / 60;
    carbsDuringTotal = Math.round(rate * fuelingHours);
  }
  const carbsDuringKcal = carbsDuringTotal * 4;

  // Total recovery budget (~95% of workout kcal, minus what is consumed during)
  const totalBudgetKcal = Math.round(workoutKcal * 0.95);
  const recoveryBudgetKcal = Math.max(0, totalBudgetKcal - carbsDuringKcal);

  // Post-workout snack (0-30 min after) — quick carbs + moderate protein
  const postIntensityFactor = 0.6 + 0.2 * iF;
  const postDurationFactor = durationMinutes < 60 ? 0.7
    : durationMinutes < 120 ? 1.0
    : durationMinutes < 240 ? 1.2
    : 1.4;
  let carbsPostGrams = Math.round(weightKg * postIntensityFactor * postDurationFactor);
  const proteinPostBase = 0.15 + 0.1 * iF;
  let proteinPostGrams = Math.round(weightKg * proteinPostBase * postDurationFactor);

  // Recovery meal (1-2h after) — protein, fat, then carbs to fill the budget
  const recoveryDurationFactor = durationMinutes < 60 ? 0.6
    : durationMinutes < 120 ? 1.0
    : durationMinutes < 240 ? 1.3
    : 1.5;
  const proteinRecoveryBase = 0.3 + 0.15 * iF;
  let proteinRecoveryGrams = Math.round(weightKg * proteinRecoveryBase * recoveryDurationFactor);
  const fatRecoveryBase = 0.1 + 0.1 * iF;
  let fatRecoveryGrams = Math.round(weightKg * fatRecoveryBase * recoveryDurationFactor);

  // Scale post + recovery down if it exceeds the recovery budget
  let carbsPostKcal = carbsPostGrams * 4;
  let proteinPostKcal = proteinPostGrams * 4;
  let proteinRecoveryKcal = proteinRecoveryGrams * 4;
  let fatRecoveryKcal = fatRecoveryGrams * 9;

  const recoveryKcal = carbsPostKcal + proteinPostKcal + proteinRecoveryKcal + fatRecoveryKcal;
  if (recoveryKcal > recoveryBudgetKcal) {
    const scale = recoveryBudgetKcal / recoveryKcal;
    carbsPostGrams = Math.round(carbsPostGrams * scale);
    proteinPostGrams = Math.round(proteinPostGrams * scale);
    proteinRecoveryGrams = Math.round(proteinRecoveryGrams * scale);
    fatRecoveryGrams = Math.round(fatRecoveryGrams * scale);
    carbsPostKcal = carbsPostGrams * 4;
    proteinPostKcal = proteinPostGrams * 4;
    proteinRecoveryKcal = proteinRecoveryGrams * 4;
    fatRecoveryKcal = fatRecoveryGrams * 9;
  }

  // Fill remaining recovery budget with carbs
  const carbsRecoveryKcal = Math.max(0, recoveryBudgetKcal - (carbsPostKcal + proteinPostKcal + proteinRecoveryKcal + fatRecoveryKcal));
  const carbsRecoveryGrams = Math.round(carbsRecoveryKcal / 4);

  const totalRecoveryKcal = carbsDuringKcal + carbsPostKcal + proteinPostKcal + carbsRecoveryKcal + proteinRecoveryKcal + fatRecoveryKcal;

  return {
    during: {
      carbsGrams: carbsDuringTotal,
      carbsKcal: carbsDuringKcal,
      carbsPerHour: durationHours > 0 ? Math.round(carbsDuringTotal / durationHours) : 0,
      applicable: carbsDuringTotal > 0
    },
    postWorkout: {
      carbsGrams: carbsPostGrams,
      carbsKcal: carbsPostKcal,
      proteinGrams: proteinPostGrams,
      proteinKcal: proteinPostKcal,
      totalKcal: carbsPostKcal + proteinPostKcal,
      timing: '0-30 min after'
    },
    recoveryMeal: {
      carbsGrams: carbsRecoveryGrams,
      carbsKcal: carbsRecoveryKcal,
      proteinGrams: proteinRecoveryGrams,
      proteinKcal: proteinRecoveryKcal,
      fatGrams: fatRecoveryGrams,
      fatKcal: fatRecoveryKcal,
      totalKcal: carbsRecoveryKcal + proteinRecoveryKcal + fatRecoveryKcal,
      timing: '1-2 hours after'
    },
    totalRecoveryKcal,
    workoutKcal
  };
};

/**
 * Determine workout type from activity data
 * @param {Object} activity - Activity or event object
 * @returns {string} 'endurance', 'interval', or 'strength'
 */
export const getWorkoutType = (activity) => {
  if (!activity) return 'endurance';
  
  const name = (activity.name || '').toLowerCase();
  const type = (activity.type || '').toLowerCase();
  
  if (name.includes('interval') || name.includes('vo2') || name.includes('sprint') ||
      name.includes('threshold') || name.includes('anaerobic') || name.includes('tempo') ||
      name.includes('sweetspot')) {
    return 'interval';
  }
  if (type.includes('weight') || type.includes('strength') || type.includes('yoga')) {
    return 'strength';
  }
  return 'endurance';
};

/**
 * Calculate daily nutrition summary
 * @param {number} bmr - Basal metabolic rate
 * @param {string} activityLevel - Activity level key
 * @param {Array} dayActivities - Completed activities for the day (with icu_joules)
 * @param {Array} dayPlannedEvents - Planned events for the day
 * @param {number} weightKg - Athlete weight in kg
 * @returns {Object} Daily nutrition summary
 */
export const calculateDailyNutrition = (bmr, activityLevel, dayActivities = [], dayPlannedEvents = [], weightKg = 70) => {
  const tdee = calculateTDEE(bmr, activityLevel);
  
  // Calculate kcal from completed activities
  const completedKcal = dayActivities.reduce((sum, a) => {
    return sum + joulesToKcal(a.icu_joules || 0);
  }, 0);

  // Calculate estimated kcal from planned events
  const plannedKcal = dayPlannedEvents.reduce((sum, e) => {
    if (e.work || e.icu_joules) {
      return sum + (e.icu_joules ? joulesToKcal(e.icu_joules) : workKjToKcal(e.work));
    }
    return sum;
  }, 0);

  const totalExerciseKcal = completedKcal + plannedKcal;
  const totalDailyNeed = tdee + totalExerciseKcal;

  return {
    bmr,
    tdee,
    completedKcal,
    plannedKcal,
    totalExerciseKcal,
    totalDailyNeed,
    activityLevel
  };
};

/**
 * Format height from meters to cm if needed
 * intervals.icu stores height in meters (e.g., 1.83)
 * @param {number} height - Height value
 * @returns {number} Height in cm
 */
export const normalizeHeightToCm = (height) => {
  if (!height) return 0;
  // If height < 3, assume it's in meters
  if (height < 3) return Math.round(height * 100);
  return Math.round(height);
};

/**
 * MET values for common activities at different effort levels.
 * MET (Metabolic Equivalent of Task) = kcal/kg/hour
 * Sources: Compendium of Physical Activities (Ainsworth et al.)
 */
export const EFFORT_LEVELS = [
  { key: 'light', label: 'Light', description: 'Easy pace, conversational' },
  { key: 'moderate', label: 'Moderate', description: 'Steady effort, slightly breathless' },
  { key: 'hard', label: 'Hard', description: 'High effort, difficult to talk' },
];

export const DEFAULT_MET_VALUES = {
  light: 4.0,
  moderate: 6.0,
  hard: 9.0,
};

/**
 * Get MET and intensity metrics for a zone slider value.
 * Uses the provided zone definitions (defaults to zoneUtils HR zones) and
 * treats MET as an approximate sport-independent intensity estimate, not a
 * scientifically exact mapping from HR or power.
 * @param {number} zoneValue - Zone value from slider (1.0 - zones.length)
 * @param {Array} [zones] - Zone definitions from zoneUtils (or fallback DEFAULT_HR_ZONES)
 * @returns {{ met: number, intensityFactor: number, effortLevel: string, zoneName: string, zoneLabel: string }}
 */
export const getZoneMetrics = (zoneValue, zones = DEFAULT_HR_ZONES) => {
  const maxZone = zones.length;
  if (maxZone < 1) {
    return { met: 0, intensityFactor: 0, effortLevel: 'moderate', zoneName: '', zoneLabel: '' };
  }
  const clamped = Math.min(maxZone, Math.max(1, zoneValue));
  const lowerIdx = Math.min(Math.floor(clamped) - 1, maxZone - 2);
  const upperIdx = lowerIdx + 1;
  const frac = clamped - Math.floor(clamped);

  const lowerZone = zones[lowerIdx];
  const upperZone = zones[upperIdx] || lowerZone;
  // Simple 4.0–9.0 MET scale from zone 1 to the last zone
  const lowerMet = 4.0 + 5.0 * (lowerIdx / (maxZone - 1 || 1));
  const upperMet = 4.0 + 5.0 * (upperIdx / (maxZone - 1 || 1));
  const met = lowerMet + (upperMet - lowerMet) * frac;

  // Map zone 1–N to intensityFactor 0–1
  const intensityFactor = Math.min(1, Math.max(0, (clamped - 1) / (maxZone - 1 || 1)));
  // Map to legacy effortLevel for backward compat
  const effortLevel = clamped <= 2 ? 'light' : clamped <= (maxZone * 0.6) ? 'moderate' : 'hard';
  // Display name from nearest integer zone
  const nearestZone = zones[Math.round(clamped) - 1] || zones[0];

  return { met: Math.round(met * 10) / 10, intensityFactor, effortLevel, zoneName: nearestZone.label, zoneLabel: nearestZone.name };
};

/**
 * Estimate kcal for an ad-hoc workout using FTP-based power calculation
 * @param {number} ftp - Functional Threshold Power in watts
 * @param {number} intensityPercent - Intensity as % of FTP (e.g. 75)
 * @param {number} durationMinutes - Duration in minutes
 * @returns {number} Estimated kcal burned
 */
export const estimateKcalFromPower = (ftp, intensityPercent, durationMinutes) => {
  if (!ftp || !intensityPercent || !durationMinutes) return 0;
  const avgWatts = ftp * (intensityPercent / 100);
  const durationSeconds = durationMinutes * 60;
  const workKj = (avgWatts * durationSeconds) / 1000;
  return workKjToKcal(workKj);
};

/**
 * Estimate kcal for an ad-hoc workout using MET values (no power data)
 * @param {number} weightKg - Athlete weight in kg
 * @param {string} effortLevel - 'light', 'moderate', or 'hard'
 * @param {number} durationMinutes - Duration in minutes
 * @param {number} metOverride - Optional custom MET value
 * @returns {number} Estimated kcal burned
 */
export const estimateKcalFromMET = (weightKg, effortLevel, durationMinutes, metOverride) => {
  if (!weightKg || !durationMinutes) return 0;
  const met = metOverride || DEFAULT_MET_VALUES[effortLevel] || DEFAULT_MET_VALUES.moderate;
  const durationHours = durationMinutes / 60;
  return Math.round(met * weightKg * durationHours);
};

/**
 * Estimate substrate oxidation (carb vs fat) based on workout intensity.
 * Based on research from Romijn et al. and Brooks & Mercier:
 * - At low intensity (~40-55% VO2max): ~40-50% carbs, ~50-60% fat
 * - At moderate intensity (~55-75% VO2max): ~55-70% carbs, ~30-45% fat
 * - At high intensity (~75-90% VO2max): ~70-85% carbs, ~15-30% fat
 * - At very high intensity (>90% VO2max): ~85-95% carbs, ~5-15% fat
 *
 * @param {number} totalKcal - Total kcal burned during workout
 * @param {number} intensityPercent - Intensity as % of FTP (for power-based sports), or null
 * @param {string|null} effortLevel - 'light', 'moderate', or 'hard' (for non-power sports), or null
 * @returns {Object} { carbPercent, fatPercent, carbGrams, fatGrams, carbKcal, fatKcal }
 */
export const estimateSubstrateOxidation = (totalKcal, intensityPercent = null, effortLevel = null) => {
  if (!totalKcal || totalKcal <= 0) return null;

  let carbPercent;

  if (intensityPercent !== null) {
    // FTP-based: map %FTP to approximate %VO2max carb oxidation
    // ~40% FTP → ~40% carbs, ~65% FTP → ~58% carbs, ~85% FTP → ~75% carbs, ~100% FTP → ~85% carbs, ~120% FTP → ~93% carbs
    if (intensityPercent <= 50) {
      carbPercent = 35 + (intensityPercent - 40) * 0.5;  // 35-40%
    } else if (intensityPercent <= 75) {
      carbPercent = 40 + (intensityPercent - 50) * 0.8;  // 40-60%
    } else if (intensityPercent <= 100) {
      carbPercent = 60 + (intensityPercent - 75) * 1.0;  // 60-85%
    } else {
      carbPercent = 85 + (intensityPercent - 100) * 0.5;  // 85-95%
    }
  } else if (effortLevel) {
    // MET-based effort level mapping
    switch (effortLevel) {
      case 'light':    carbPercent = 45; break;
      case 'moderate': carbPercent = 60; break;
      case 'hard':     carbPercent = 80; break;
      default:         carbPercent = 60;
    }
  } else {
    carbPercent = 60; // default moderate
  }

  carbPercent = Math.min(95, Math.max(30, carbPercent));
  const fatPercent = 100 - carbPercent;

  const carbKcal = Math.round(totalKcal * carbPercent / 100);
  const fatKcal = totalKcal - carbKcal;
  const carbGrams = Math.round(carbKcal / 4);
  const fatGrams = Math.round(fatKcal / 9);

  return {
    carbPercent: Math.round(carbPercent),
    fatPercent: Math.round(fatPercent),
    carbGrams,
    fatGrams,
    carbKcal,
    fatKcal
  };
};

/**
 * Get available sports from athlete sport settings as groups, plus a default "Workout" fallback.
 * Each sport setting group becomes one selectable option (e.g. "Ride" group, "Run" group).
 * @param {Array} sportSettings - Sport settings array from athlete profile
 * @returns {Array} Array of { key, label, ftp, hasPower, types } objects
 */
export const getAvailableSports = (sportSettings) => {
  const sports = [];

  if (sportSettings && Array.isArray(sportSettings)) {
    sportSettings.forEach((setting, idx) => {
      const types = setting.types && Array.isArray(setting.types) ? setting.types : [];
      // Use the first type as the group key, or fallback to index
      const groupKey = types[0] || `Sport${idx}`;
      // Use the setting's id or first type as the label
      const label = (groupKey).replace(/([A-Z])/g, ' $1').trim();
      sports.push({
        key: groupKey,
        label,
        ftp: setting.ftp || 0,
        hasPower: (setting.ftp || 0) > 0,
        types,
      });
    });
  }

  // Always add "Workout" as a catch-all for sports not in sportSettings
  sports.push({
    key: 'Workout',
    label: 'Workout',
    ftp: 0,
    hasPower: false,
    types: [],
  });

  return sports;
};

export default {
  getActivityKcal,
  joulesToKcal,
  workKjToKcal,
  calculateBMR,
  calculateTDEE,
  estimateActivityLevel,
  calculateWorkoutMacros,
  getWorkoutType,
  calculateDailyNutrition,
  normalizeHeightToCm,
  estimateKcalFromPower,
  estimateKcalFromMET,
  estimateSubstrateOxidation,
  getAvailableSports,
  getZoneMetrics,
  ACTIVITY_LEVELS,
  EFFORT_LEVELS,
  DEFAULT_MET_VALUES
};