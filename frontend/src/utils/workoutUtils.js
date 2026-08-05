/**
 * Shared workout utility functions
 * Used for workout metrics calculations and parsing
 */

/**
 * Extract TSS from workout name (e.g., "VO2Max TSS 128" -> 128)
 * @param {string} name - Workout name
 * @returns {number|null} TSS value or null if not found
 */
export const extractTSSFromName = (name) => {
  if (!name) return null;
  const match = name.match(/TSS\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Parse workout name to separate main name from short description
 * @param {string} name - Full workout name (e.g., "Threshold TSS73 4x(9min@103-104%)")
 * @returns {Object} { mainName: string, shortDescription: string|null }
 */
export const parseWorkoutName = (name) => {
  if (!name) {
    return { mainName: 'Workout', shortDescription: null };
  }

  // Pattern: Category TSS## [shortDescription]
  // Match: "Threshold TSS73 4x(9min@103-104%)" -> { mainName: "Threshold TSS73", shortDescription: "4x(9min@103-104%)" }
  const match = name.match(/^(.+?\s+TSS\d+)\s+(.+)$/);
  
  if (match) {
    return {
      mainName: match[1],
      shortDescription: match[2]
    };
  }

  // If no short description found, return the whole name as mainName
  return {
    mainName: name,
    shortDescription: null
  };
};

/**
 * Calculate workout metrics from workout_doc
 * Uses normalized power (4th root of the average 4th powers) for intensity/TSS alignment with the backend.
 * @param {Object} workoutDoc - Workout document with steps
 * @param {number} ftp - Functional Threshold Power
 * @returns {Object|null} Metrics { moving_time, average_watts, icu_intensity, work, tss }
 */
export const calculateWorkoutMetrics = (workoutDoc, ftp) => {
  if (!workoutDoc?.steps || !ftp) {
    return null;
  }

  const steps = flattenSteps(workoutDoc.steps);
  let totalDuration = 0;
  let totalWork = 0;
  let totalWeightedPower = 0;

  for (const step of steps) {
    const duration = step.duration || 0;
    if (duration === 0) continue;
    totalDuration += duration;

    // Average power for the step as percentage of FTP, truncated to integer
    // to match Java backend (asInt() / integer division).
    let powerPercent = 50;
    if (step.power?.start !== undefined && step.power?.end !== undefined) {
      const startInt = Math.trunc(step.power.start);
      const endInt = Math.trunc(step.power.end);
      powerPercent = Math.trunc((startInt + endInt) / 2);
    } else if (step.power?.value !== undefined) {
      powerPercent = Math.trunc(step.power.value);
    }

    // Work in joules for average power
    const watts = (powerPercent / 100) * ftp;
    totalWork += watts * duration;

    // Normalized power weighting: duration * (powerPercent/100)^4
    totalWeightedPower += duration * Math.pow(powerPercent / 100, 4);
  }

  const avgPower = totalDuration > 0 ? totalWork / totalDuration : 0;
  const normalizedPower = totalDuration > 0
    ? Math.pow(totalWeightedPower / totalDuration, 0.25) * 100
    : 0;
  const intensity = ftp > 0 ? normalizedPower / 100 : 0;
  const workKJ = totalWork / 1000; // Convert to kJ

  // TSS = (duration_hours * intensity^2 * 100), rounded to integer
  const tss = totalDuration > 0
    ? Math.round((totalDuration / 3600) * Math.pow(intensity, 2) * 100)
    : 0;

  return {
    moving_time: totalDuration,
    average_watts: Math.round(avgPower),
    icu_intensity: intensity,
    work: Math.round(workKJ),
    tss
  };
};

/**
 * Flatten nested workout steps (handle reps)
 * @param {Array} steps - Workout steps array
 * @returns {Array} Flattened steps array
 */
export const flattenSteps = (steps) => {
  const result = [];
  for (const step of steps) {
    if (step.steps && step.steps.length > 0) {
      const reps = step.reps || 1;
      for (let i = 0; i < reps; i++) {
        result.push(...flattenSteps(step.steps));
      }
    } else if (step.reps && step.reps > 1 && step.duration) {
      for (let i = 0; i < step.reps; i++) {
        result.push({ ...step, reps: 1 });
      }
    } else {
      result.push(step);
    }
  }
  return result;
};

/**
 * Get workout color based on intensity
 * @param {Object} event - Event/workout object
 * @returns {string} Tailwind CSS background color class
 */
export const getWorkoutColor = (event) => {
  if (event.category === 'WORKOUT') {
    // icu_intensity can be either decimal (0.86) or percentage (86)
    const intensity = event.icu_intensity || 0;
    const normalizedIntensity = intensity > 2 ? intensity / 100 : intensity;
    if (normalizedIntensity >= 0.9) return 'bg-orange-500';
    if (normalizedIntensity >= 0.75) return 'bg-yellow-400';
    if (normalizedIntensity >= 0.6) return 'bg-green-500';
    return 'bg-blue-500';
  }
  if (event.category === 'NOTE') return 'bg-purple-400';
  return 'bg-gray-400';
};

/**
 * Format seconds in a compact workout notation.
 * Short durations (< 2 min) are shown as seconds (30sec, 90sec);
 * longer durations use minutes (4min, 5min, 4:30min).
 */
const formatDurationShort = (seconds) => {
  const totalSeconds = Math.round(seconds);
  if (totalSeconds < 120) return `${totalSeconds}sec`;
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  if (sec === 0) return `${min}min`;
  return `${min}:${sec.toString().padStart(2, '0')}min`;
};

const stepsEqual = (a, b) => {
  return (
    a.type === b.type &&
    Math.round(a.duration || 0) === Math.round(b.duration || 0) &&
    Math.round(a.power ?? 0) === Math.round(b.power ?? 0) &&
    (a.reps || 1) === (b.reps || 1) &&
    Math.round(a.restDuration || 0) === Math.round(b.restDuration || 0) &&
    Math.round(a.restPower ?? 0) === Math.round(b.restPower ?? 0) &&
    Math.round(a.powerStart ?? 0) === Math.round(b.powerStart ?? 0) &&
    Math.round(a.powerEnd ?? 0) === Math.round(b.powerEnd ?? 0)
  );
};

const formatIntervalBlock = (step, nested = false) => {
  const work = formatDurationShort(step.duration || 0);
  const power = Math.round(step.power ?? 0);
  const reps = step.reps || 1;

  if (step.restDuration > 0) {
    const rest = formatDurationShort(step.restDuration);
    if (nested) {
      return `${reps}x(${work}/${rest})@${power}%`;
    }
    return `${reps}x((${work}/${rest})@${power}%)`;
  }

  return `${reps}x(${work}@${power}%)`;
};

const formatSingleStep = (step) => {
  const duration = formatDurationShort(step.duration || 0);

  if (step.powerStart !== undefined && step.powerEnd !== undefined) {
    const start = Math.round(step.powerStart);
    const end = Math.round(step.powerEnd);
    const powerRange = start === end ? `${start}%` : `${start}-${end}%`;
    return `${duration}@${powerRange}`;
  }

  return `${duration}@${Math.round(step.power ?? 0)}%`;
};

const isRestStep = (step) => step.type === 'recovery';

/**
 * Build a short description from the visible workout steps.
 * - Skips warmup and cooldown.
 * - Includes interval rest inside each rep.
 * - Collapses two identical interval sets separated by a recovery.
 */
export const buildShortDescription = (steps) => {
  if (!steps || steps.length === 0) return '';

  const visibleSteps = steps.filter(step => step.type !== 'warmup' && step.type !== 'cooldown');
  const parts = [];

  for (let i = 0; i < visibleSteps.length; i++) {
    const step = visibleSteps[i];

    if (
      step.type === 'interval' &&
      i + 2 < visibleSteps.length &&
      visibleSteps[i + 2].type === 'interval' &&
      stepsEqual(step, visibleSteps[i + 2]) &&
      isRestStep(visibleSteps[i + 1])
    ) {
      parts.push(`2x(${formatIntervalBlock(step, true)})`);
      parts.push(`${formatSingleStep(visibleSteps[i + 1])} rest between sets`);
      i += 2;
    } else {
      parts.push(step.type === 'interval' ? formatIntervalBlock(step, false) : formatSingleStep(step));
    }
  }

  return parts.join(' + ');
};

const getStepPowerValue = (step) => {
  const power = step?.power || step?.pace || {};
  if (power.value !== undefined) return Math.round(Number(power.value));
  if (power.start !== undefined && power.end !== undefined) {
    return Math.round((Number(power.start) + Number(power.end)) / 2);
  }
  return 0;
};

/**
 * Convert a backend workout_doc into Workout Creator steps.
 * Handles Warmup/Cooldown/Ramp, SteadyState/Recovery and grouped IntervalsT.
 */
export const parseWorkoutDocToSteps = (workoutDoc) => {
  if (!workoutDoc?.steps || !Array.isArray(workoutDoc.steps)) return [];

  return workoutDoc.steps.map((step, index) => {
    const base = { id: Date.now() + index };
    const nested = step.steps;

    if (step.reps && Array.isArray(nested) && nested.length >= 2) {
      const work = nested[0];
      const rest = nested[1];
      return {
        ...base,
        type: 'interval',
        reps: Number(step.reps) || 1,
        duration: Number(work.duration) || 0,
        power: getStepPowerValue(work),
        restDuration: Number(rest.duration) || 0,
        restPower: getStepPowerValue(rest)
      };
    }

    // Also accept pace-based steps (workout_doc.steps[].pace) so pace-mode
    // workouts saved from Run workouts can be re-opened for editing.
    const power = step.power || step.pace || {};
    if (power.start !== undefined && power.end !== undefined) {
      const start = Math.round(Number(power.start));
      const end = Math.round(Number(power.end));
      let type = 'ramp';
      if (step.until_lap_press) type = 'warmup';
      else if (start > end) type = 'cooldown';
      return {
        ...base,
        type,
        duration: Number(step.duration) || 0,
        powerStart: start,
        powerEnd: end
      };
    }

    if (power.value !== undefined) {
      const value = Math.round(Number(power.value));
      const type = value < 70 ? 'recovery' : 'steady';
      return {
        ...base,
        type,
        duration: Number(step.duration) || 0,
        power: value
      };
    }

    return null;
  }).filter(Boolean);
};

/**
 * Convert flattened workout steps with %FTP-style "power" targets into
 * Intervals.icu pace targets ("pace": { units: "%pace", value/start/end }).
 * The underlying percentage values are reused as-is (they represent % of
 * threshold pace instead of % of FTP when the workout is built in pace mode).
 * @param {Array} steps - Flattened workout steps (each with a `power` object)
 * @returns {Array} Steps with `power` replaced by `pace`
 */
export const convertStepsToPaceTargets = (steps) => {
  return steps.map(step => {
    const { power, ...rest } = step;
    if (!power) return step;
    const pace = { units: '%pace' };
    if (power.value !== undefined) pace.value = power.value;
    if (power.start !== undefined) pace.start = power.start;
    if (power.end !== undefined) pace.end = power.end;
    return { ...rest, pace };
  });
};

export default {
  calculateWorkoutMetrics,
  flattenSteps,
  getWorkoutColor,
  buildShortDescription,
  parseWorkoutDocToSteps,
  convertStepsToPaceTargets
};
