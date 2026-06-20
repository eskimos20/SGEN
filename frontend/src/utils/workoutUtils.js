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
 * Note: TSS/icu_training_load is NOT calculated here - use extractTSSFromName() instead
 * @param {Object} workoutDoc - Workout document with steps
 * @param {number} ftp - Functional Threshold Power
 * @returns {Object|null} Metrics { moving_time, average_watts, icu_intensity, work }
 */
export const calculateWorkoutMetrics = (workoutDoc, ftp) => {
  if (!workoutDoc?.steps || !ftp) {
    return null;
  }

  const steps = flattenSteps(workoutDoc.steps);
  let totalDuration = 0;
  let totalWork = 0;

  for (const step of steps) {
    const duration = step.duration || 0;
    totalDuration += duration;

    let stepPower = 0;
    if (step.power?.start !== undefined && step.power?.end !== undefined) {
      // Ramp - average power
      const startPower = (step.power.start / 100) * ftp;
      const endPower = (step.power.end / 100) * ftp;
      stepPower = (startPower + endPower) / 2;
    } else if (step.power?.value !== undefined) {
      // Steady state
      stepPower = (step.power.value / 100) * ftp;
    }

    totalWork += stepPower * duration;
  }

  const avgPower = totalDuration > 0 ? totalWork / totalDuration : 0;
  const intensity = ftp > 0 ? avgPower / ftp : 0;
  const workKJ = totalWork / 1000; // Convert to kJ

  return {
    moving_time: totalDuration,
    average_watts: Math.round(avgPower),
    icu_intensity: Math.round(intensity * 100) / 100,
    work: Math.round(workKJ)
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

export default {
  calculateWorkoutMetrics,
  flattenSteps,
  getWorkoutColor
};
