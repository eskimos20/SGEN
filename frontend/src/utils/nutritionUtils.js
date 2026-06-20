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
export const calculateWorkoutMacros = (workoutKcal, weightKg, durationMinutes, workoutType = 'endurance', intensityFactor = null) => {
  if (!workoutKcal || !weightKg) return null;

  const durationHours = (durationMinutes || 60) / 60;
  const isLong = durationMinutes >= 120;
  const isHigh = workoutType === 'interval';

  // During workout — applicable from 45 min
  // 45-60 min: light fueling (20-30g/h carbs), >60 min: full fueling
  // When intensityFactor is provided, interpolate between low and high rates
  let carbsDuringPerHour = 0;
  if (durationMinutes >= 45 && durationMinutes <= 60) {
    const lo = 20, hi = 30;
    carbsDuringPerHour = intensityFactor !== null
      ? Math.round(lo + (hi - lo) * intensityFactor)
      : (isHigh ? hi : lo);
  } else if (durationMinutes > 60 && durationMinutes <= 120) {
    const lo = 45, hi = 60;
    carbsDuringPerHour = intensityFactor !== null
      ? Math.round(lo + (hi - lo) * intensityFactor)
      : (isHigh ? hi : lo);
  } else if (durationMinutes > 120) {
    const lo = 60, hi = 80;
    carbsDuringPerHour = intensityFactor !== null
      ? Math.round(lo + (hi - lo) * intensityFactor)
      : (isHigh ? hi : lo);
  }
  // Fuel from the start (after first 15 min)
  const fuelingHours = durationMinutes >= 45 ? Math.max(0, (durationMinutes - 15) / 60) : 0;
  const carbsDuringTotal = Math.round(carbsDuringPerHour * fuelingHours);
  const carbsDuringKcal = carbsDuringTotal * 4;

  // Post-workout snack (0-30 min after) — quick-absorbing, lighter
  // Focus on fast carbs + moderate protein for glycogen resynthesis
  // All values scale with both duration and intensity
  const iF = intensityFactor !== null ? intensityFactor : (isHigh ? 1.0 : 0.5);
  const postIntensityFactor = 0.6 + 0.2 * iF;
  const postDurationFactor = durationMinutes < 60 ? 0.7
    : durationMinutes < 120 ? 1.0
    : durationMinutes < 240 ? 1.2
    : 1.4;
  const carbsPostGrams = Math.round(weightKg * postIntensityFactor * postDurationFactor);
  // Protein: base 0.2 g/kg, scaled by duration (longer = more breakdown) and intensity
  const proteinPostBase = 0.15 + 0.1 * iF;  // 0.15-0.25 g/kg
  const proteinPostGrams = Math.round(weightKg * proteinPostBase * postDurationFactor);
  const carbsPostKcal = carbsPostGrams * 4;
  const proteinPostKcal = proteinPostGrams * 4;

  // Recovery meal (1-2h after) — full balanced meal
  // Protein: 0.3-0.5 g/kg scaled by intensity + duration
  // Fat: 0.1-0.25 g/kg scaled by duration + intensity
  const recoveryDurationFactor = durationMinutes < 60 ? 0.6
    : durationMinutes < 120 ? 1.0
    : durationMinutes < 240 ? 1.3
    : 1.5;
  const proteinRecoveryBase = 0.3 + 0.15 * iF;  // 0.3-0.45 g/kg
  const proteinRecoveryGrams = Math.round(weightKg * proteinRecoveryBase * recoveryDurationFactor);
  const fatRecoveryBase = 0.1 + 0.1 * iF;  // 0.1-0.2 g/kg
  const fatRecoveryGrams = Math.round(weightKg * fatRecoveryBase * recoveryDurationFactor);
  const proteinRecoveryKcal = proteinRecoveryGrams * 4;
  const fatRecoveryKcal = fatRecoveryGrams * 9;

  // Calculate carbs for recovery meal to fill the gap to ~95% replacement
  const targetTotalKcal = Math.round(workoutKcal * 0.95);
  const alreadyAccountedKcal = carbsDuringKcal + carbsPostKcal + proteinPostKcal + proteinRecoveryKcal + fatRecoveryKcal;
  const carbsRecoveryKcal = Math.max(0, targetTotalKcal - alreadyAccountedKcal);
  const carbsRecoveryGrams = Math.round(carbsRecoveryKcal / 4);

  // Total nutrition needed
  const totalRecoveryKcal = carbsDuringKcal + carbsPostKcal + proteinPostKcal + carbsRecoveryKcal + proteinRecoveryKcal + fatRecoveryKcal;

  return {
    during: {
      carbsGrams: carbsDuringTotal,
      carbsKcal: carbsDuringKcal,
      carbsPerHour: durationHours > 0 ? Math.round(carbsDuringTotal / durationHours) : 0,
      applicable: durationMinutes >= 45
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
 * Training zones Z1-Z7 with universal MET values based on HR intensity.
 * At a given HR zone the metabolic cost is similar regardless of sport —
 * 180 bpm skiing ≈ 180 bpm running ≈ 180 bpm swimming metabolically.
 * Sources: Compendium of Physical Activities (Ainsworth et al.)
 */
export const TRAINING_ZONES = [
  { zone: 1, label: 'Z1', name: 'Recovery',      hr: '<60%',    met: 5.0 },
  { zone: 2, label: 'Z2', name: 'Endurance',     hr: '60-70%',  met: 7.0 },
  { zone: 3, label: 'Z3', name: 'Tempo',         hr: '70-80%',  met: 9.5 },
  { zone: 4, label: 'Z4', name: 'Threshold',     hr: '80-90%',  met: 11.5 },
  { zone: 5, label: 'Z5', name: 'VO2max',        hr: '90-95%',  met: 14.0 },
  { zone: 6, label: 'Z6', name: 'Anaerobic',     hr: '95-100%', met: 15.5 },
  { zone: 7, label: 'Z7', name: 'Neuromuscular', hr: 'Max',     met: 17.0 },
];

/**
 * Get MET and intensity metrics for a zone slider value.
 * Supports decimal values (e.g. 2.5 = between Z2 and Z3) for smooth slider interpolation.
 * @param {number} zoneValue - Zone value from slider (1.0 - 7.0)
 * @returns {{ met: number, intensityFactor: number, effortLevel: string, zoneName: string }}
 */
export const getZoneMetrics = (zoneValue) => {
  const clamped = Math.min(7, Math.max(1, zoneValue));
  const lowerIdx = Math.min(Math.floor(clamped) - 1, TRAINING_ZONES.length - 2);
  const upperIdx = lowerIdx + 1;
  const frac = clamped - Math.floor(clamped);

  const lowerZone = TRAINING_ZONES[lowerIdx];
  const upperZone = TRAINING_ZONES[upperIdx] || lowerZone;
  const met = lowerZone.met + (upperZone.met - lowerZone.met) * frac;

  // Map zone 1-7 to intensityFactor 0-1: Z1→0.0, Z4→0.5, Z7→1.0
  const intensityFactor = Math.min(1, Math.max(0, (clamped - 1) / 6));
  // Map to legacy effortLevel for backward compat
  const effortLevel = clamped <= 2 ? 'light' : clamped <= 4 ? 'moderate' : 'hard';
  // Display name from nearest integer zone
  const nearestZone = TRAINING_ZONES[Math.round(clamped) - 1] || TRAINING_ZONES[0];

  return { met: Math.round(met * 10) / 10, intensityFactor, effortLevel, zoneName: nearestZone.name, zoneLabel: nearestZone.label };
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
  DEFAULT_MET_VALUES,
  TRAINING_ZONES
};
