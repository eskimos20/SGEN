/**
 * Central utility for Intervals.icu sport type → emoji / name / color mapping.
 * Covers every activity type exposed by the Intervals.icu OpenAPI spec.
 * Used by: WorkoutItemCard, AthleteProfile, CalendarGrid (via WorkoutItemCard).
 */

/**
 * Lookup table keyed by lowercased exact Intervals.icu activity type.
 * Each entry: { emoji, name, color }
 * color maps to keys in getSportColorClasses (athleteUtils).
 */
export const SPORT_TYPE_MAP = {
  // ── Cycling ────────────────────────────────────────────────────────────────
  ride:               { emoji: '🚴', name: 'Cycling',            color: 'blue'   },
  virtualride:        { emoji: '🚴', name: 'Virtual Ride',       color: 'blue'   },
  ebikeride:          { emoji: '🚴', name: 'E-Bike Ride',        color: 'blue'   },
  gravelride:         { emoji: '🚵', name: 'Gravel Ride',        color: 'blue'   },
  mountainbikeride:   { emoji: '🚵', name: 'MTB Ride',           color: 'blue'   },
  emountainbikeride:  { emoji: '🚵', name: 'E-MTB Ride',         color: 'blue'   },
  trackride:          { emoji: '🚴', name: 'Track Ride',         color: 'blue'   },
  velomobile:         { emoji: '🚴', name: 'Velomobile',         color: 'blue'   },
  handcycle:          { emoji: '🦽', name: 'Handcycle',          color: 'blue'   },

  // ── Running ────────────────────────────────────────────────────────────────
  run:                { emoji: '🏃', name: 'Running',            color: 'green'  },
  virtualrun:         { emoji: '🏃', name: 'Virtual Run',        color: 'green'  },
  trailrun:           { emoji: '🏃', name: 'Trail Run',          color: 'green'  },

  // ── Swimming ───────────────────────────────────────────────────────────────
  swim:               { emoji: '🏊', name: 'Swimming',           color: 'cyan'   },
  openwaterswim:      { emoji: '🌊', name: 'Open Water Swim',    color: 'cyan'   },

  // ── Skiing & Snow ──────────────────────────────────────────────────────────
  alpineski:          { emoji: '🎿', name: 'Alpine Ski',         color: 'indigo' },
  backcountryski:     { emoji: '🎿', name: 'Backcountry Ski',    color: 'indigo' },
  nordicski:          { emoji: '⛷️', name: 'Nordic Ski',         color: 'indigo' },
  rollerski:          { emoji: '⛷️', name: 'Roller Ski',         color: 'indigo' },
  virtualski:         { emoji: '🎿', name: 'Virtual Ski',        color: 'indigo' },
  snowboard:          { emoji: '🏂', name: 'Snowboard',          color: 'indigo' },
  snowshoe:           { emoji: '🥾', name: 'Snowshoe',           color: 'indigo' },
  iceskate:           { emoji: '⛸️', name: 'Ice Skate',          color: 'indigo' },
  inlineskate:        { emoji: '🛼', name: 'Inline Skate',       color: 'indigo' },

  // ── Rowing & Paddling ──────────────────────────────────────────────────────
  rowing:             { emoji: '🚣', name: 'Rowing',             color: 'amber'  },
  virtualrow:         { emoji: '🚣', name: 'Virtual Row',        color: 'amber'  },
  canoeing:           { emoji: '🛶', name: 'Canoeing',           color: 'amber'  },
  kayaking:           { emoji: '🛶', name: 'Kayaking',           color: 'amber'  },
  standuppaddling:    { emoji: '🏄', name: 'Stand Up Paddling',  color: 'cyan'   },

  // ── Water & Wind ───────────────────────────────────────────────────────────
  surfing:            { emoji: '🏄', name: 'Surfing',            color: 'cyan'   },
  windsurf:           { emoji: '🏄', name: 'Windsurf',           color: 'cyan'   },
  kitesurf:           { emoji: '🪁', name: 'Kitesurf',           color: 'cyan'   },
  sail:               { emoji: '⛵', name: 'Sailing',            color: 'cyan'   },
  watersport:         { emoji: '🌊', name: 'Water Sport',        color: 'cyan'   },

  // ── Strength & Gym ─────────────────────────────────────────────────────────
  weighttraining:     { emoji: '🏋️', name: 'Weight Training',    color: 'purple' },
  workout:            { emoji: '🏋️', name: 'Workout',            color: 'purple' },
  crossfit:           { emoji: '💪', name: 'Crossfit',           color: 'orange' },
  highintensityintervaltraining: { emoji: '⚡', name: 'HIIT',    color: 'orange' },
  elliptical:         { emoji: '🔄', name: 'Elliptical',         color: 'gray'   },
  stairstepper:       { emoji: '🪜', name: 'Stair Stepper',      color: 'gray'   },
  pilates:            { emoji: '🧘', name: 'Pilates',            color: 'purple' },
  yoga:               { emoji: '🧘', name: 'Yoga',               color: 'purple' },

  // ── Racket Sports ──────────────────────────────────────────────────────────
  tennis:             { emoji: '🎾', name: 'Tennis',             color: 'yellow' },
  padel:              { emoji: '🎾', name: 'Padel',              color: 'yellow' },
  squash:             { emoji: '🎾', name: 'Squash',             color: 'yellow' },
  racquetball:        { emoji: '🎾', name: 'Racquetball',        color: 'yellow' },
  badminton:          { emoji: '🏸', name: 'Badminton',          color: 'yellow' },
  tabletennis:        { emoji: '🏓', name: 'Table Tennis',       color: 'yellow' },
  pickleball:         { emoji: '🏓', name: 'Pickleball',         color: 'yellow' },

  // ── Team Sports ────────────────────────────────────────────────────────────
  soccer:             { emoji: '⚽', name: 'Soccer',             color: 'green'  },
  rugby:              { emoji: '🏉', name: 'Rugby',              color: 'green'  },
  hockey:             { emoji: '🏒', name: 'Hockey',             color: 'gray'   },

  // ── Outdoor & Other ────────────────────────────────────────────────────────
  hike:               { emoji: '🥾', name: 'Hiking',             color: 'green'  },
  walk:               { emoji: '🚶', name: 'Walking',            color: 'green'  },
  rockclimbing:       { emoji: '🧗', name: 'Rock Climbing',      color: 'orange' },
  golf:               { emoji: '⛳', name: 'Golf',               color: 'green'  },
  skateboard:         { emoji: '🛹', name: 'Skateboard',         color: 'gray'   },
  wheelchair:         { emoji: '♿', name: 'Wheelchair',         color: 'gray'   },
  transition:         { emoji: '🔄', name: 'Transition',         color: 'gray'   },
};

/**
 * Event type mappings for calendar events (non-sport categories)
 * Used by: WorkoutItemCard, EventDetailModal
 */
export const EVENT_TYPE_MAP = {
  // ── Personal Events ────────────────────────────────────────────────────────
  sick:               { emoji: '🤒', name: 'Sick',               color: 'red'    },
  holiday:            { emoji: '🏖️', name: 'Holiday',            color: 'blue'   },
  note:               { emoji: '📝', name: 'Note',               color: 'purple' },
  injured:            { emoji: '🤕', name: 'Injured',            color: 'orange' },
  
  // ── Training Events ────────────────────────────────────────────────────────
  race_a:             { emoji: '🏁', name: 'A Race',             color: 'yellow' },
  race_b:             { emoji: '🏁', name: 'B Race',             color: 'gray'   },
  race_c:             { emoji: '🏁', name: 'C Race',             color: 'gray'   },
  season_start:       { emoji: '🚀', name: 'Season Start',       color: 'green'  },
  wellness:           { emoji: '❤️', name: 'Wellness',           color: 'pink'   },
  workout:            { emoji: '💪', name: 'Workout',            color: 'purple' },
};

/**
 * Get the emoji for a given event category (non-sport events)
 * @param {string} category - Event category (SICK, HOLIDAY, NOTE, etc.)
 * @returns {string} emoji character
 */
export const getEventEmoji = (category) => {
  if (!category) return '📅';
  const key = category.toLowerCase();
  if (EVENT_TYPE_MAP[key]) return EVENT_TYPE_MAP[key].emoji;
  
  // Fallback to calendar emoji for unknown categories
  return '📅';
};

/**
 * Get full event info for a given event category
 * @param {string} category - Event category
 * @returns {{ emoji: string, name: string, color: string }}
 */
export const getEventInfo = (category) => {
  if (!category) return { emoji: '📅', name: 'Event', color: 'gray' };
  const key = category.toLowerCase();
  if (EVENT_TYPE_MAP[key]) return EVENT_TYPE_MAP[key];
  
  return { emoji: '📅', name: category, color: 'gray' };
};
export const getSportEmoji = (activityType) => {
  if (!activityType) return '🏅';
  const key = activityType.toLowerCase();
  if (SPORT_TYPE_MAP[key]) return SPORT_TYPE_MAP[key].emoji;

  // Pattern-based fallbacks for unknown / future types
  if (key.includes('ride') || key.includes('bike') || key.includes('cycle')) return '🚴';
  if (key.includes('run'))   return '🏃';
  if (key.includes('swim'))  return '🏊';
  if (key.includes('ski'))   return '⛷️';
  if (key.includes('row'))   return '🚣';
  if (key.includes('walk'))  return '🚶';
  if (key.includes('hike'))  return '🥾';
  if (key.includes('yoga') || key.includes('pilates')) return '🧘';
  if (key.includes('weight') || key.includes('strength') || key.includes('workout')) return '🏋️';
  if (key.includes('kayak') || key.includes('canoe'))  return '🛶';
  if (key.includes('surf'))  return '🏄';
  if (key.includes('hockey')) return '🏒';
  if (key.includes('tennis')) return '🎾';
  if (key.includes('soccer') || key.includes('football')) return '⚽';
  if (key.includes('climb')) return '🧗';
  return '🏅';
};

/**
 * Get full sport info for a given Intervals.icu activity type string.
 * @param {string} activityType - e.g. "Ride", "VirtualRide", "Run"
 * @returns {{ emoji: string, name: string, color: string }}
 */
export const getSportInfo = (activityType) => {
  if (!activityType) return { emoji: '🏅', name: 'Other', color: 'gray' };
  const key = activityType.toLowerCase();
  if (SPORT_TYPE_MAP[key]) return SPORT_TYPE_MAP[key];

  // Pattern-based fallbacks
  const emoji = getSportEmoji(activityType);
  let name = activityType.replace(/([A-Z])/g, ' $1').trim();
  let color = 'gray';
  if (key.includes('ride') || key.includes('bike') || key.includes('cycle')) color = 'blue';
  else if (key.includes('run')) color = 'green';
  else if (key.includes('swim')) color = 'cyan';
  else if (key.includes('ski') || key.includes('snow')) color = 'indigo';
  else if (key.includes('row') || key.includes('kayak') || key.includes('canoe')) color = 'amber';

  return { emoji, name, color };
};

export default { SPORT_TYPE_MAP, EVENT_TYPE_MAP, getSportEmoji, getEventEmoji, getSportInfo, getEventInfo };
