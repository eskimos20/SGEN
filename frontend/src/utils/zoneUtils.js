// Shared zone definitions
export const ZONE_NAMES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'];
export const ZONE_COLOR_HEX = ['#9ca3af', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#c026d3', '#5b21b6'];
export const ZONE_DISPLAY_NAMES = ['Z1 (Recovery)', 'Z2 (Aerobic)', 'Z3 (Tempo)', 'Z4 (SubThreshold)', 'Z5 (SuperThreshold)', 'Z6 (VO2max)', 'Z7 (Anaerobic)'];

// Default power zones (% of FTP) - used when no athlete zones available
const DEFAULT_POWER_ZONES = [
  { name: 'Z1', label: 'Recovery', min: 0, max: 55, color: ZONE_COLOR_HEX[0] },
  { name: 'Z2', label: 'Endurance', min: 56, max: 75, color: ZONE_COLOR_HEX[1] },
  { name: 'Z3', label: 'Tempo', min: 76, max: 90, color: ZONE_COLOR_HEX[2] },
  { name: 'Z4', label: 'Threshold', min: 91, max: 105, color: ZONE_COLOR_HEX[3] },
  { name: 'Z5', label: 'VO2max', min: 106, max: 120, color: ZONE_COLOR_HEX[4] },
  { name: 'Z6', label: 'Anaerobic', min: 121, max: 150, color: ZONE_COLOR_HEX[5] },
  { name: 'Z7', label: 'Sprint', min: 151, max: 200, color: ZONE_COLOR_HEX[6] }
];

// Default HR zones (% of LTHR or Max HR) - used when no athlete zones available
const DEFAULT_HR_ZONES = [
  { name: 'Z1', label: 'Recovery', min: 0, max: 68, color: ZONE_COLOR_HEX[0] },
  { name: 'Z2', label: 'Endurance', min: 69, max: 83, color: ZONE_COLOR_HEX[1] },
  { name: 'Z3', label: 'Tempo', min: 84, max: 94, color: ZONE_COLOR_HEX[2] },
  { name: 'Z4', label: 'Threshold', min: 95, max: 105, color: ZONE_COLOR_HEX[3] },
  { name: 'Z5', label: 'VO2max', min: 106, max: 120, color: ZONE_COLOR_HEX[4] }
];

// Zone colors for consistent styling
export const ZONE_COLORS = {
  Z1: { bg: 'bg-gray-400', hex: ZONE_COLOR_HEX[0], label: 'Recovery' },
  Z2: { bg: 'bg-blue-500', hex: ZONE_COLOR_HEX[1], label: 'Endurance' },
  Z3: { bg: 'bg-green-500', hex: ZONE_COLOR_HEX[2], label: 'Tempo' },
  Z4: { bg: 'bg-yellow-500', hex: ZONE_COLOR_HEX[3], label: 'Threshold' },
  Z5: { bg: 'bg-red-500', hex: ZONE_COLOR_HEX[4], label: 'VO2max' },
  Z6: { bg: 'bg-fuchsia-600', hex: ZONE_COLOR_HEX[5], label: 'Anaerobic' },
  Z7: { bg: 'bg-violet-800', hex: ZONE_COLOR_HEX[6], label: 'Sprint' },
  SS: { bg: 'bg-orange-400', hex: '#fb923c', label: 'Sweet Spot' }
};

/**
 * Parse power zones from Intervals.icu sport settings
 * Intervals.icu returns zones as upper bounds: [55, 75, 90, 105, 120, 150, 999]
 * where each value is the upper limit of that zone (Z1 upper = 55%, Z2 upper = 75%, etc.)
 * @param {Array} powerZones - Array of zone upper boundaries from API
 * @returns {Array} Parsed zones with min/max percentages
 */
export const parsePowerZones = (powerZones) => {
  if (!powerZones || !Array.isArray(powerZones) || powerZones.length < 2) {
    return DEFAULT_POWER_ZONES;
  }

  const zones = [];
  let prevMax = 0;
  for (let i = 0; i < powerZones.length; i++) {
    const upperBound = powerZones[i];
    // Skip invalid zones (like 999 for Z7)
    if (upperBound >= 999) {
      zones.push({
        name: ZONE_NAMES[i] || `Z${i + 1}`,
        min: prevMax + 1,
        max: 200,
        color: ZONE_COLOR_HEX[i] || '#ef4444'
      });
      break;
    }
    
    zones.push({
      name: ZONE_NAMES[i] || `Z${i + 1}`,
      min: prevMax + (i === 0 ? 0 : 1),
      max: upperBound,
      color: ZONE_COLOR_HEX[i] || '#9ca3af'
    });
    prevMax = upperBound;
  }

  return zones;
};

/**
 * Parse HR zones from Intervals.icu sport settings
 * Intervals.icu returns HR zones as upper bounds (similar to power zones)
 * @param {Array} hrZones - Array of zone upper boundaries from API
 * @returns {Array} Parsed zones with min/max percentages
 */
export const parseHrZones = (hrZones) => {
  if (!hrZones || !Array.isArray(hrZones) || hrZones.length < 2) {
    return DEFAULT_HR_ZONES;
  }

  const zones = [];
  let prevMax = 0;
  for (let i = 0; i < hrZones.length; i++) {
    const upperBound = hrZones[i];
    // Skip invalid zones (like 999)
    if (upperBound >= 999) {
      zones.push({
        name: ZONE_NAMES[i] || `Z${i + 1}`,
        min: prevMax + 1,
        max: 220,
        color: ZONE_COLOR_HEX[i] || '#ef4444'
      });
      break;
    }
    
    zones.push({
      name: ZONE_NAMES[i] || `Z${i + 1}`,
      min: prevMax + (i === 0 ? 0 : 1),
      max: upperBound,
      color: ZONE_COLOR_HEX[i] || '#9ca3af'
    });
    prevMax = upperBound;
  }

  return zones;
};

/**
 * Get sport settings for a specific activity type
 * @param {Array} sportSettings - Array of sport settings from athlete profile
 * @param {string} activityType - Activity type (e.g., 'Ride', 'Run', 'VirtualRide')
 * @returns {Object} Sport settings for the activity type, or defaults
 */
export const getSportSettingsForType = (sportSettings, activityType) => {
  if (!sportSettings || !Array.isArray(sportSettings)) {
    return {
      ftp: 280,
      lthr: 165,
      maxHr: 190,
      powerZones: DEFAULT_POWER_ZONES,
      hrZones: DEFAULT_HR_ZONES,
      thresholdPace: 0,
      paceUnits: 'MINS_KM'
    };
  }

  // Map activity types to sport categories
  const typeMapping = {
    'Ride': 'Ride',
    'VirtualRide': 'Ride',
    'Run': 'Run',
    'VirtualRun': 'Run',
    'Swim': 'Swim',
    'Walk': 'Run',
    'Hike': 'Run'
  };

  const category = typeMapping[activityType] || activityType;

  // Find matching sport settings
  const settings = sportSettings.find(s => 
    s.types && s.types.some(t => t === category || t === activityType)
  );

  if (!settings) {
    // Try to find default/first settings
    const defaultSettings = sportSettings[0];
    return {
      ftp: defaultSettings?.ftp || 280,
      lthr: defaultSettings?.lthr || 165,
      maxHr: defaultSettings?.max_hr || defaultSettings?.maxHr || 190,
      powerZones: parsePowerZones(defaultSettings?.power_zones || defaultSettings?.powerZones),
      hrZones: parseHrZones(defaultSettings?.hr_zones || defaultSettings?.hrZones),
      thresholdPace: defaultSettings?.threshold_pace || defaultSettings?.thresholdPace || 0,
      paceUnits: defaultSettings?.pace_units || defaultSettings?.paceUnits || 'MINS_KM'
    };
  }

  return {
    ftp: settings.ftp || 280,
    lthr: settings.lthr || 165,
    maxHr: settings.max_hr || settings.maxHr || 190,
    powerZones: parsePowerZones(settings.power_zones || settings.powerZones),
    hrZones: parseHrZones(settings.hr_zones || settings.hrZones),
    thresholdPace: settings.threshold_pace || settings.thresholdPace || 0,
    paceUnits: settings.pace_units || settings.paceUnits || 'MINS_KM'
  };
};

/**
 * Get zone for a given power percentage
 * @param {number} powerPercent - Power as percentage of FTP
 * @param {Array} zones - Power zones array
 * @returns {Object} Zone object with name, color, etc.
 */
export const getZoneForPower = (powerPercent, zones = DEFAULT_POWER_ZONES) => {
  for (let i = zones.length - 1; i >= 0; i--) {
    if (powerPercent >= zones[i].min) {
      return zones[i];
    }
  }
  return zones[0];
};

/**
 * Get zone color for a given power percentage
 * @param {number} powerPercent - Power as percentage of FTP
 * @param {Array} zones - Power zones array
 * @returns {Object} Color object with bg class and hex value
 */
export const getZoneColorForPower = (powerPercent, zones = DEFAULT_POWER_ZONES) => {
  const zone = getZoneForPower(powerPercent, zones);
  const zoneInfo = ZONE_COLORS[zone.name] || ZONE_COLORS.Z1;
  return {
    bg: zoneInfo.bg,
    hex: zone.color || zoneInfo.hex
  };
};

/**
 * Get the reference distance (in meters) used by a given Intervals.icu pace unit.
 * @param {string} paceUnits - e.g. 'MINS_KM', 'MINS_MI', 'SECS_100M'
 * @returns {number} Distance in meters
 */
export const getPaceDistanceMeters = (paceUnits) => {
  switch (paceUnits) {
    case 'MINS_MI': return 1609.34;
    case 'SECS_100M': return 100;
    case 'SECS_100Y': return 91.44;
    case 'SECS_400M': return 400;
    case 'MINS_KM':
    default: return 1000;
  }
};

/**
 * Get the display suffix for a given Intervals.icu pace unit.
 * @param {string} paceUnits
 * @returns {string} e.g. '/km', '/mi', '/100m'
 */
export const getPaceUnitSuffix = (paceUnits) => {
  switch (paceUnits) {
    case 'MINS_MI': return '/mi';
    case 'SECS_100M': return '/100m';
    case 'SECS_100Y': return '/100y';
    case 'SECS_400M': return '/400m';
    case 'MINS_KM':
    default: return '/km';
  }
};

/**
 * Convert a velocity (m/s) into a bare "mm:ss" pace value (no unit suffix).
 * Useful as the value of an editable pace input field.
 * @param {number} velocityMs - Speed in meters/second
 * @param {string} paceUnits - Intervals.icu pace unit (e.g. 'MINS_KM')
 * @returns {string} "mm:ss", or '' if invalid
 */
export const formatPaceValue = (velocityMs, paceUnits) => {
  if (!velocityMs || velocityMs <= 0) return '';
  const distance = getPaceDistanceMeters(paceUnits);
  const totalSeconds = Math.round(distance / velocityMs);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Convert a velocity (m/s) into a formatted pace string (e.g. "5:30/km").
 * @param {number} velocityMs - Speed in meters/second
 * @param {string} paceUnits - Intervals.icu pace unit (e.g. 'MINS_KM')
 * @returns {string} Formatted pace string, or '--:--' if invalid
 */
export const formatPaceFromVelocity = (velocityMs, paceUnits) => {
  const value = formatPaceValue(velocityMs, paceUnits);
  return value ? `${value}${getPaceUnitSuffix(paceUnits)}` : '--:--';
};

/**
 * Parse a "mm:ss" pace string into a velocity (m/s), given the reference pace unit.
 * @param {string} paceString - e.g. "5:30"
 * @param {string} paceUnits - Intervals.icu pace unit (e.g. 'MINS_KM')
 * @returns {number|null} Velocity in m/s, or null if invalid
 */
export const parsePaceToVelocity = (paceString, paceUnits) => {
  if (!paceString) return null;
  const match = String(paceString).trim().match(/^(\d+):([0-5]?\d)$/);
  if (!match) return null;
  const totalSeconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  if (totalSeconds <= 0) return null;
  return getPaceDistanceMeters(paceUnits) / totalSeconds;
};

const HR_ZONE_LABELS = ['Recovery', 'Aerobic', 'Tempo', 'SubThreshold', 'SuperThreshold', 'VO2max', 'Anaerobic'];

/**
 * Calculate time in power and heart rate zones for a single activity
 * Uses Intervals.icu zone times if available, otherwise calculates from streams
 * @param {Object} activity - Activity object with potential icu_zone_times and icu_hr_zone_times
 * @param {Array} sportSettings - Sport settings from athlete profile
 * @param {Array} streams - Activity streams (time, watts, heartrate)
 * @returns {Object} { powerZoneBreakdown, hrZoneBreakdown }
 */
export const calculateActivityZones = (activity, sportSettings, streams) => {
  const activityType = activity?.type || activity?.icu_type || '';
  const settings = getSportSettingsForType(sportSettings, activityType);
  const { ftp, lthr, maxHr, powerZones, hrZones } = settings;

  // --- Power zones ---
  let powerZoneSeconds = [0, 0, 0, 0, 0, 0, 0];

  // Try to use pre-calculated Intervals.icu zone times
  if (activity?.icu_zone_times && Array.isArray(activity.icu_zone_times) && activity.icu_zone_times.length > 0) {
    activity.icu_zone_times.forEach((zone, idx) => {
      if (idx < 7) {
        powerZoneSeconds[idx] = (zone?.secs || zone || 0);
      }
    });
  } else if (streams && settings) {
    // Calculate from streams
    let wattsData = [];
    let timeData = [];
    if (Array.isArray(streams)) {
      const wattsStream = streams.find(s => s.type === 'watts');
      const timeStream = streams.find(s => s.type === 'time');
      wattsData = wattsStream?.data || [];
      timeData = timeStream?.data || [];
    } else {
      wattsData = Array.isArray(streams.watts) ? streams.watts : (streams.watts?.data || []);
      timeData = Array.isArray(streams.time) ? streams.time : (streams.time?.data || []);
    }

    if (wattsData.length > 0 && timeData.length > 0 && ftp > 0) {
      for (let i = 0; i < wattsData.length; i++) {
        const watts = wattsData[i];
        if (!watts || watts <= 0) continue;

        const powerPercent = (watts / ftp) * 100;
        const zone = getZoneForPower(powerPercent, powerZones);
        const zoneIdx = ZONE_NAMES.indexOf(zone.name);

        // Calculate duration between this point and the next
        const nextTime = timeData[i + 1];
        const currentTime = timeData[i];
        const duration = nextTime !== undefined ? nextTime - currentTime : 1;

        if (zoneIdx >= 0) {
          powerZoneSeconds[zoneIdx] += Math.max(0, duration);
        }
      }
    }
  }

  // --- Heart rate zones ---
  let hrZoneSeconds = [0, 0, 0, 0, 0, 0, 0];

  // Try to use pre-calculated Intervals.icu HR zone times
  if (activity?.icu_hr_zone_times && Array.isArray(activity.icu_hr_zone_times) && activity.icu_hr_zone_times.length > 0) {
    activity.icu_hr_zone_times.forEach((time, idx) => {
      if (idx < 7) {
        hrZoneSeconds[idx] = time || 0;
      }
    });
  } else if (streams && settings) {
    // Calculate from streams
    let hrData = [];
    let timeData = [];
    if (Array.isArray(streams)) {
      const hrStream = streams.find(s => s.type === 'heartrate');
      const timeStream = streams.find(s => s.type === 'time');
      hrData = hrStream?.data || [];
      timeData = timeStream?.data || [];
    } else {
      hrData = Array.isArray(streams.heartrate) ? streams.heartrate : (streams.heartrate?.data || []);
      timeData = Array.isArray(streams.time) ? streams.time : (streams.time?.data || []);
    }

    const hrBase = lthr > 0 ? lthr : (maxHr > 0 ? maxHr : 165);
    if (hrData.length > 0 && timeData.length > 0 && hrBase > 0) {
      for (let i = 0; i < hrData.length; i++) {
        const hr = hrData[i];
        if (!hr || hr <= 0) continue;

        const hrPercent = (hr / hrBase) * 100;
        const zone = getZoneForPower(hrPercent, hrZones);
        const zoneIdx = ZONE_NAMES.indexOf(zone.name);

        const nextTime = timeData[i + 1];
        const currentTime = timeData[i];
        const duration = nextTime !== undefined ? nextTime - currentTime : 1;

        if (zoneIdx >= 0) {
          hrZoneSeconds[zoneIdx] += Math.max(0, duration);
        }
      }
    }
  }

  const totalPowerSeconds = powerZoneSeconds.reduce((sum, t) => sum + t, 0);
  const powerZoneBreakdown = ZONE_NAMES
    .map((name, idx) => ({
      name: `${name} (${powerZones[idx]?.label || HR_ZONE_LABELS[idx] || ''})`,
      shortName: name,
      time: powerZoneSeconds[idx],
      percent: totalPowerSeconds > 0 ? Math.round(powerZoneSeconds[idx] / totalPowerSeconds * 100) : 0,
      color: powerZones[idx]?.color || ZONE_COLOR_HEX[idx]
    }))
    .filter(z => z.time > 0);

  const totalHrSeconds = hrZoneSeconds.reduce((sum, t) => sum + t, 0);
  const hrZoneBreakdown = ZONE_NAMES
    .map((name, idx) => ({
      name: `${name} (${hrZones[idx]?.label || HR_ZONE_LABELS[idx] || ''})`,
      shortName: name,
      time: hrZoneSeconds[idx],
      percent: totalHrSeconds > 0 ? Math.round(hrZoneSeconds[idx] / totalHrSeconds * 100) : 0,
      color: hrZones[idx]?.color || ZONE_COLOR_HEX[idx]
    }))
    .filter(z => z.time > 0);

  return {
    powerZoneBreakdown,
    hrZoneBreakdown,
    totalPowerSeconds,
    totalHrSeconds,
    hasPower: totalPowerSeconds > 0,
    hasHR: totalHrSeconds > 0
  };
};

export { DEFAULT_POWER_ZONES, DEFAULT_HR_ZONES };
