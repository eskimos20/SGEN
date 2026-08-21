import { useMemo } from 'react';
import { format, startOfWeek } from 'date-fns';
import { calculateAge, getVolumeColor } from '../utils/athleteUtils';

// Colors for pie chart
export const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

// Calculate activity statistics
export const useActivityStats = (data) => {
  return useMemo(() => {
    if (!data?.activities) return null;
    const activities = data.activities;
    return {
      totalActivities: activities.length,
      totalTime: activities.reduce((sum, a) => sum + (a.moving_time || 0), 0),
      totalDistance: activities.reduce((sum, a) => sum + (a.distance || 0), 0),
      totalLoad: activities.reduce((sum, a) => sum + (a.icu_training_load || 0), 0),
      avgHR: activities.filter(a => a.average_heartrate).reduce((sum, a, _, arr) => sum + a.average_heartrate / arr.length, 0),
    };
  }, [data]);
};

// Calculate weekly data for charts
export const useWeeklyData = (data, athleteProfile) => {
  return useMemo(() => {
    if (!data?.activities) return null;
    const activities = data.activities;
    
    // Get athlete age for volume color coding
    const athleteAge = calculateAge(athleteProfile?.athlete?.icu_date_of_birth);
    const ageForColors = athleteAge || 35;
    
    // Group by week
    const weekMap = new Map();
    activities.forEach(a => {
      const date = new Date(a.start_date_local || a.start_date);
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { week: weekKey, hours: 0, load: 0, activities: 0, sessionsByType: {} });
      }
      const w = weekMap.get(weekKey);
      const type = a.type || 'Other';
      w.hours += (a.moving_time || 0) / 3600;
      w.load += a.icu_training_load || 0;
      w.activities += 1;
      w.sessionsByType[type] = (w.sessionsByType[type] || 0) + 1;
    });
    const weeks = Array.from(weekMap.values())
      .map(w => ({ ...w, fill: getVolumeColor(w.hours, ageForColors) }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Activity type breakdown
    const typeMap = new Map();
    activities.forEach(a => {
      const type = a.type || 'Other';
      if (!typeMap.has(type)) {
        typeMap.set(type, { name: type, time: 0, count: 0 });
      }
      const t = typeMap.get(type);
      t.time += (a.moving_time || 0);
      t.count += 1;
    });
    const typeBreakdown = Array.from(typeMap.values()).sort((a, b) => b.time - a.time);

    // HR Zone totals for pie chart - Intervals.icu uses icu_hr_zone_times
    // Array format from Intervals.icu: [Z1, Z2, Z3, Z4, Z5, Z6, Z7] in seconds
    const zoneNames = ['Z1 (Recovery)', 'Z2 (Aerobic)', 'Z3 (Tempo)', 'Z4 (SubThreshold)', 'Z5 (SuperThreshold)', 'Z6 (VO2max)', 'Z7 (Anaerobic)'];
    const zoneTotals = [0, 0, 0, 0, 0, 0, 0];
    
    activities.forEach(a => {
      const zoneTimes = a.icu_hr_zone_times;
      
      if (Array.isArray(zoneTimes) && zoneTimes.length > 0) {
        // Sum up seconds for each zone across all activities
        zoneTimes.forEach((time, idx) => {
          if (idx < 7 && time > 0) {
            zoneTotals[idx] += time;
          }
        });
      }
    });

    const totalZoneTime = zoneTotals.reduce((sum, t) => sum + t, 0);
    const hrZoneBreakdown = zoneNames.map((name, idx) => ({
      name,
      time: zoneTotals[idx],
      percent: totalZoneTime > 0 ? Math.round(zoneTotals[idx] / totalZoneTime * 100) : 0
    })).filter(z => z.time > 0);

    // Power Zone totals for pie chart - Intervals.icu uses icu_zone_times
    // Array format from Intervals.icu: [Z1, Z2, Z3, Z4, Z5, Z6, Z7] in seconds (as objects with secs property)
    const powerZoneNames = ['Z1 (Recovery)', 'Z2 (Aerobic)', 'Z3 (Tempo)', 'Z4 (SubThreshold)', 'Z5 (SuperThreshold)', 'Z6 (VO2max)', 'Z7 (Anaerobic)'];
    const powerZoneTotals = [0, 0, 0, 0, 0, 0, 0];
    
    activities.forEach(a => {
      const zoneTimes = a.icu_zone_times;
      
      if (Array.isArray(zoneTimes) && zoneTimes.length > 0) {
        // Sum up seconds for each zone across all activities
        // icu_zone_times contains objects with secs property
        zoneTimes.forEach((zoneObj, idx) => {
          if (idx < 7 && zoneObj && zoneObj.secs > 0) {
            powerZoneTotals[idx] += zoneObj.secs;
          }
        });
      }
    });

    const totalPowerZoneTime = powerZoneTotals.reduce((sum, t) => sum + t, 0);
    const powerZoneBreakdown = powerZoneNames.map((name, idx) => ({
      name,
      time: powerZoneTotals[idx],
      percent: totalPowerZoneTime > 0 ? Math.round(powerZoneTotals[idx] / totalPowerZoneTime * 100) : 0
    })).filter(z => z.time > 0);

    return { weeks, typeBreakdown, hrZoneBreakdown, powerZoneBreakdown, totalZoneTime, totalPowerZoneTime };
  }, [data, athleteProfile]);
};

// Combined hook for all statistics data
export const useStatisticsData = (data, athleteProfile) => {
  const activityStats = useActivityStats(data);
  const weeklyData = useWeeklyData(data, athleteProfile);
  
  return {
    activityStats,
    weeklyData,
    COLORS
  };
};
