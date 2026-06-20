// Default power zones (% of FTP) - used when no athlete zones available
const DEFAULT_POWER_ZONES = [
  { name: 'Z1', label: 'Recovery', min: 0, max: 55, color: '#9ca3af' },
  { name: 'Z2', label: 'Endurance', min: 56, max: 75, color: '#3b82f6' },
  { name: 'Z3', label: 'Tempo', min: 76, max: 90, color: '#22c55e' },
  { name: 'Z4', label: 'Threshold', min: 91, max: 105, color: '#eab308' },
  { name: 'Z5', label: 'VO2max', min: 106, max: 120, color: '#f97316' },
  { name: 'Z6', label: 'Anaerobic', min: 121, max: 150, color: '#ef4444' }
];

// Default HR zones (% of LTHR or Max HR) - used when no athlete zones available
const DEFAULT_HR_ZONES = [
  { name: 'Z1', label: 'Recovery', min: 0, max: 68, color: '#9ca3af' },
  { name: 'Z2', label: 'Aerobic', min: 69, max: 83, color: '#3b82f6' },
  { name: 'Z3', label: 'Tempo', min: 84, max: 94, color: '#22c55e' },
  { name: 'Z4', label: 'Threshold', min: 95, max: 105, color: '#eab308' },
  { name: 'Z5', label: 'VO2max', min: 106, max: 120, color: '#ef4444' }
];

// Zone colors for consistent styling
export const ZONE_COLORS = {
  Z1: { bg: 'bg-gray-400', hex: '#9ca3af', label: 'Recovery' },
  Z2: { bg: 'bg-blue-500', hex: '#3b82f6', label: 'Endurance' },
  Z3: { bg: 'bg-green-500', hex: '#22c55e', label: 'Tempo' },
  Z4: { bg: 'bg-yellow-500', hex: '#eab308', label: 'Threshold' },
  Z5: { bg: 'bg-orange-500', hex: '#f97316', label: 'VO2max' },
  Z6: { bg: 'bg-red-500', hex: '#ef4444', label: 'Anaerobic' },
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
  const zoneNames = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'];
  const zoneColors = ['#9ca3af', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#dc2626'];

  let prevMax = 0;
  for (let i = 0; i < powerZones.length; i++) {
    const upperBound = powerZones[i];
    // Skip invalid zones (like 999 for Z7)
    if (upperBound >= 999) {
      zones.push({
        name: zoneNames[i] || `Z${i + 1}`,
        min: prevMax + 1,
        max: 200,
        color: zoneColors[i] || '#ef4444'
      });
      break;
    }
    
    zones.push({
      name: zoneNames[i] || `Z${i + 1}`,
      min: prevMax + (i === 0 ? 0 : 1),
      max: upperBound,
      color: zoneColors[i] || '#9ca3af'
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
  const zoneNames = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'];
  const zoneColors = ['#9ca3af', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#dc2626'];

  let prevMax = 0;
  for (let i = 0; i < hrZones.length; i++) {
    const upperBound = hrZones[i];
    // Skip invalid zones (like 999)
    if (upperBound >= 999) {
      zones.push({
        name: zoneNames[i] || `Z${i + 1}`,
        min: prevMax + 1,
        max: 220,
        color: zoneColors[i] || '#ef4444'
      });
      break;
    }
    
    zones.push({
      name: zoneNames[i] || `Z${i + 1}`,
      min: prevMax + (i === 0 ? 0 : 1),
      max: upperBound,
      color: zoneColors[i] || '#9ca3af'
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
      hrZones: DEFAULT_HR_ZONES
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
      hrZones: parseHrZones(defaultSettings?.hr_zones || defaultSettings?.hrZones)
    };
  }

  return {
    ftp: settings.ftp || 280,
    lthr: settings.lthr || 165,
    maxHr: settings.max_hr || settings.maxHr || 190,
    powerZones: parsePowerZones(settings.power_zones || settings.powerZones),
    hrZones: parseHrZones(settings.hr_zones || settings.hrZones)
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

export { DEFAULT_POWER_ZONES, DEFAULT_HR_ZONES };
