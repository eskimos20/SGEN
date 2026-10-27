const ZONE_COUNT = 7;

const emptyZones = () => Array(ZONE_COUNT).fill(0);

const hasZoneTime = (zones) => Array.isArray(zones) && zones.some((seconds) => seconds > 0);

const readZoneArray = (value) => {
  if (!Array.isArray(value)) return null;
  const zones = emptyZones();
  let sweetSpot = 0;

  value.forEach((entry, index) => {
    const seconds = typeof entry === 'number' ? entry : Number(entry?.secs || 0);
    const id = String(entry?.id || `Z${index + 1}`).toUpperCase();
    if (id === 'SS') {
      sweetSpot += seconds;
      return;
    }
    const zoneIndex = Number(id.match(/^Z([1-7])$/)?.[1]) - 1;
    if (zoneIndex >= 0 && zoneIndex < ZONE_COUNT) zones[zoneIndex] += seconds;
  });

  return { zones, sweetSpot };
};

const sourceFor = (activity, source) => {
  if (source === 'POWER') return readZoneArray(activity.icu_zone_times);
  if (source === 'HR') return readZoneArray(activity.icu_hr_zone_times);
  if (source === 'PACE') {
    const pace = activity.use_gap_zone_times ? activity.gap_zone_times : activity.pace_zone_times;
    return readZoneArray(pace) || readZoneArray(activity.pace_zone_times) || readZoneArray(activity.gap_zone_times);
  }
  return null;
};

const addZones = (target, source) => {
  source?.zones.forEach((seconds, index) => { target[index] += seconds; });
};

export const classifyTrainingDistribution = (zones) => {
  const s1 = zones[0] + zones[1];
  const s2 = zones[2] + zones[3];
  const s3 = zones[4] + zones[5] + zones[6];
  const total = s1 + s2 + s3;

  if (!total) return { label: 'No zone data', s1, s2, s3, total, shares: [0, 0, 0], polarizationIndex: null };

  let label = 'Unique';
  if (s3 > s2 && s3 > 0.499 * (s2 + s1)) label = 'HIIT';
  else if (s3 > s2 && s1 > s2) label = 'Polarized';
  else if (s1 > 3.99 * s2 && s1 > 3 * (s2 + s3)) label = 'Base';
  else if (s1 > 1.4 * s2 && s2 > 1.4 * s3 && s3 / total >= 0.05) label = 'Pyramidal';
  else if (s1 < 4 * s2 && s2 > 0.5 * s3) label = 'Threshold';

  const shares = [s1, s2, s3].map((seconds) => seconds / total);
  const polarizationIndex = shares[0] > 0 && shares[1] > 0 && shares[2] > 0
    ? Math.log10((shares[0] / shares[1]) * shares[2] * 100)
    : null;

  return { label, s1, s2, s3, total, shares, polarizationIndex };
};

export const buildTrainingTotals = (activities = [], periodDays = 30) => {
  const powerZones = emptyZones();
  const hrZones = emptyZones();
  const paceZones = emptyZones();
  const combinedZones = emptyZones();
  let powerSweetSpot = 0;
  let combinedSweetSpot = 0;
  let combinedZoneActivityCount = 0;
  const activeDays = new Set();
  const sports = new Map();

  activities.forEach((activity) => {
    const power = sourceFor(activity, 'POWER');
    const hr = sourceFor(activity, 'HR');
    const pace = sourceFor(activity, 'PACE');
    if (power) addZones(powerZones, power);
    if (hr) addZones(hrZones, hr);
    if (pace) addZones(paceZones, pace);
    powerSweetSpot += power?.sweetSpot || 0;

    const order = String(activity.tiz_order || 'POWER_HR_PACE').split('_');
    const combined = order.map((item) => sourceFor(activity, item)).find((item) => hasZoneTime(item?.zones));
    if (combined) {
      addZones(combinedZones, combined);
      combinedSweetSpot += combined.sweetSpot || 0;
      combinedZoneActivityCount += 1;
    }

    const date = activity.start_date_local?.slice(0, 10);
    if (date) activeDays.add(date);
    const type = activity.type || 'Other';
    const sport = sports.get(type) || { type, count: 0, time: 0, distance: 0, load: 0 };
    sport.count += 1;
    sport.time += Number(activity.moving_time || 0);
    sport.distance += Number(activity.distance || activity.icu_distance || 0);
    sport.load += Number(activity.icu_training_load || 0);
    sports.set(type, sport);
  });

  const totals = activities.reduce((result, activity) => {
    result.time += Number(activity.moving_time || 0);
    result.distance += Number(activity.distance || activity.icu_distance || 0);
    result.coasting += Number(activity.coasting_time || 0);
    result.climbing += Number(activity.total_elevation_gain || 0);
    result.load += Number(activity.icu_training_load || 0);
    result.calories += Number(activity.calories || 0);
    result.weightLifted += Number(activity.kg_lifted || 0);
    result.work += Number(activity.icu_joules || 0);
    return result;
  }, { time: 0, distance: 0, coasting: 0, climbing: 0, load: 0, calories: 0, weightLifted: 0, work: 0 });

  return {
    ...totals,
    activities: activities.length,
    weeks: Math.floor(periodDays / 7),
    days: periodDays,
    activeDays: activeDays.size,
    sports: Array.from(sports.values()).sort((a, b) => b.time - a.time),
    zones: {
      combined: combinedZones,
      power: powerZones,
      hr: hrZones,
      pace: paceZones,
      combinedSweetSpot,
      powerSweetSpot,
      combinedZoneActivityCount,
    },
    distribution: classifyTrainingDistribution(combinedZones),
  };
};
