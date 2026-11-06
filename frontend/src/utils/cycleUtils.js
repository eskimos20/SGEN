/**
 * Training-cycle math shared by the scheduler: deload weeks, build-week
 * indices and the TSS progression scale. All functions are pure.
 */

export const toUtcMidnight = (dateValue) => {
  const d = typeof dateValue === 'string' ? new Date(`${dateValue}T00:00:00`) : new Date(dateValue);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

export const getDaysDiff = (dateValue, startValue) =>
  Math.floor((toUtcMidnight(dateValue) - toUtcMidnight(startValue)) / 86400000);

export const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(utcMidnight - (day - 1) * 86400000);
};

export const getCycleInfo = (date, deloadConfig, startDate) => {
  if (!startDate) {
    return { isDeload: false, buildIndex: null };
  }

  const planWeekStart = getWeekStart(startDate);
  const weekStart = getWeekStart(date);
  const weekIndex = Math.floor(getDaysDiff(weekStart, planWeekStart) / 7);

  const buildWeeks = Number(deloadConfig?.buildWeeks ?? 3);

  // If deload is disabled, cycle buildIndex based on buildWeeks (no deload week in cycle)
  if (!deloadConfig?.enabled) {
    const cycleIndex = ((weekIndex % buildWeeks) + buildWeeks) % buildWeeks;
    return { isDeload: false, buildIndex: cycleIndex };
  }

  const cycleLength = Math.max(buildWeeks, 1) + 1;
  const cycleIndex = ((weekIndex % cycleLength) + cycleLength) % cycleLength;

  const isDeload = deloadConfig.position === 'start'
    ? cycleIndex === 0
    : cycleIndex === Math.max(buildWeeks, 1);

  if (isDeload) {
    return { isDeload, buildIndex: null };
  }

  const buildIndex = deloadConfig.position === 'start'
    ? cycleIndex - 1
    : cycleIndex;

  return { isDeload, buildIndex };
};

export const isDeloadWeek = (date, deloadConfig, startDate) =>
  getCycleInfo(date, deloadConfig, startDate).isDeload;

// TSS progression scale: Deload 60%, Week 1 = 0%, Week 2 = 10%, Week 3 = 20%, Week 4 = 30%
export const getProgressionScale = (date, deloadConfig, isDeload, progressiveEnabled, startDate) => {
  if (!progressiveEnabled) return 1;
  if (isDeload) return (deloadConfig?.deloadPercent ?? 60) / 100; // Deload = configured % of base TSS

  const { buildIndex } = getCycleInfo(date, deloadConfig, startDate);
  if (buildIndex === null || buildIndex === undefined) return 1;

  const safeBuildIndex = Math.max(buildIndex, 0);
  // Progressive TSS increase: Week 1 = 0%, Week 2 = 10%, Week 3 = 20%, Week 4 = 30%
  const progressionValues = [0, 0.10, 0.20, 0.30];
  const progressionIndex = Math.min(safeBuildIndex, progressionValues.length - 1);
  return 1 + progressionValues[progressionIndex];
};

export const getProgressionLevel = (date, deloadConfig, isDeload, progressiveEnabled, startDate) => {
  if (!progressiveEnabled || isDeload) return null;

  const { buildIndex } = getCycleInfo(date, deloadConfig, startDate);
  if (buildIndex === null || buildIndex === undefined) return null;

  return Math.min(Math.max(buildIndex, 0), 3);
};
