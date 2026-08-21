import { calculateAge, getVolumeColor, getAgeGroupInfo, extractSportSettings, getSportCategory, getSportColorClasses } from './athleteUtils';
import { removeNullValues, formatDuration, getCurrentDateTime } from './dataUtils';
import api from '../api/axios';

// Statistics utility functions - pure functions without side effects

export const buildMinimalData = (data, weeklyData, getUpcomingWorkouts, includeUpcoming = false, activityStats = null) => {
  if (!data) return null;
  
  const age = calculateAge(data.athlete?.icu_date_of_birth);
  const currentDateTime = getCurrentDateTime();
  const upcomingWorkouts = includeUpcoming ? getUpcomingWorkouts() : [];
  
  // Get unique activity types from activities
  const activityTypes = new Set(data.activities?.map(a => a.type) || []);
  
  // Filter sportSettings to only include types that are actually used
  const allSportSettings = extractSportSettings(data.athlete);
  const relevantSportSettings = allSportSettings.filter(setting => 
    setting.types.some(type => activityTypes.has(type))
  );
  
  // Simplify HR zone summary - remove timeFormatted (AI can calculate from percent)
  const hrZoneSummary = weeklyData?.hrZoneBreakdown?.map(z => ({
    zone: z.name,
    percent: z.percent
  }));

  // Simplify Power zone summary - remove timeFormatted (AI can calculate from percent)
  const powerZoneSummary = weeklyData?.powerZoneBreakdown?.map(z => ({
    zone: z.name,
    percent: z.percent
  }));

  const formatDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const addDays = (dateStr, days) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return undefined;
    date.setDate(date.getDate() + days);
    return formatDateKey(date);
  };
  const getWeekStartKey = (dateStr) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return undefined;
    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diffToMonday);
    return formatDateKey(date);
  };

  const deloadWeekStarts = new Set(
    (data.events || [])
      .filter(event => event?.isDeloadWeek)
      .map(event => event.start_date_local || event.start_date)
      .map(getWeekStartKey)
      .filter(Boolean)
  );

  // Use already precomputed weekly data from useStatisticsData hook
  const weeklyVolumeLoadSummary = (weeklyData?.weeks || [])
    .map((week) => ({
      weekStart: week.week,
      weekEnd: addDays(week.week, 6),
      volumeHours: Math.round((week.hours || 0) * 10) / 10,
      tss: Math.round((week.load || 0) * 10) / 10,
      totalSessions: week.activities || 0,
      sessionsByType: week.sessionsByType || {},
      isDeloadWeek: deloadWeekStarts.has(week.week)
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const activityTypeCounts = (weeklyData?.typeBreakdown || []).reduce((acc, typeEntry) => {
    acc[typeEntry.name] = typeEntry.count || 0;
    return acc;
  }, {});

  const periodSummary = {
    activitiesCount: activityStats?.totalActivities ?? (data.activities?.length || 0),
    totalTimeSeconds: Math.round(activityStats?.totalTime || 0),
    totalTimeHours: Math.round(((activityStats?.totalTime || 0) / 3600) * 10) / 10,
    totalDistanceKm: Math.round(((activityStats?.totalDistance || 0) / 1000) * 10) / 10,
    totalTrainingLoad: Math.round(activityStats?.totalLoad || 0),
    activityTypeCounts,
    hrZoneSummary,
    powerZoneSummary
  };
  
  // Limit wellness to last 14 days and remove redundant fields
  const limitedWellness = data.wellness?.slice(-14).map(w => {
    const ctl = w.ctl;
    const atl = w.atl;
    const sleepSecs = w.sleepSecs ?? w.sleep_secs;

    return {
      id: w.id,
      ctl: Math.round((ctl || 0) * 10) / 10,
      atl: Math.round((atl || 0) * 10) / 10,
      form: (ctl !== undefined && ctl !== null && atl !== undefined && atl !== null) ? Math.round((ctl - atl) * 10) / 10 : undefined,
      rampRate: Math.round(((w.rampRate ?? w.ramp_rate) || 0) * 10) / 10,
      hrv: w.hrv,
      hrvSDNN: w.hrvSDNN ?? w.hrv_sdnn,
      restingHR: w.restingHR ?? w.resting_hr,
      sleepHours: sleepSecs !== undefined && sleepSecs !== null ? Math.round((sleepSecs / 3600) * 10) / 10 : undefined,
      sleepScore: w.sleepScore ?? w.sleep_score
      // Removed: sportInfo (too detailed), tempWeight, tempRestingHR (not needed)
    };
  });
  
  // Get latest fitness from today's wellness entry
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const todayWellness = limitedWellness?.find(w => w.id === todayKey);
  const fallbackWellness = limitedWellness?.length > 0 ? limitedWellness[limitedWellness.length - 1] : null;
  const fitnessEntry = todayWellness || fallbackWellness;
  
  const latestFitness = fitnessEntry ? {
    ctl: fitnessEntry.ctl,
    atl: fitnessEntry.atl,
    tsb: (fitnessEntry.ctl ?? 0) - (fitnessEntry.atl ?? 0)
  } : null;
  const hasCurrentDayRestingHr = (limitedWellness || []).some(w =>
    w?.id === todayKey && w?.restingHR !== undefined && w?.restingHR !== null
  );
  const athleteRestingHr = hasCurrentDayRestingHr
    ? undefined
    : (data.athlete?.icu_resting_hr ?? data.athlete?.resting_hr);
  
  const minimalData = {
    currentDateTime,
    dateRange: data.dateRange,
    athlete: data.athlete ? {
      name: "None of your business",
      age,
      weight: data.athlete.icu_weight,
      restingHr: athleteRestingHr,
      sportSettings: relevantSportSettings
    } : null,
    periodSummary,
    activities: data.activities?.map(activity => {
      // Determine if this is a running activity
      const activityType = activity.type || '';
      const isRunning = ['Run', 'Running', 'TrailRun', 'VirtualRun', 'Treadmill'].some(
        t => activityType.toLowerCase().includes(t.toLowerCase())
      );
      
      // Format pace from m/s to min/km string
      const formatPaceForAI = (paceMetersPerSecond) => {
        if (!paceMetersPerSecond || paceMetersPerSecond <= 0) return undefined;
        const secondsPerKm = 1000 / paceMetersPerSecond;
        const minutes = Math.floor(secondsPerKm / 60);
        const seconds = Math.round(secondsPerKm % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      };
      
      // Calculate max cadence from intervals (not available at activity level)
      const maxCadenceFromIntervals = Array.isArray(activity.icu_intervals) && activity.icu_intervals.length > 0
        ? Math.max(...activity.icu_intervals.map(i => i.max_cadence || 0).filter(c => c > 0))
        : 0;
      
      const activityData = {
        name: activity.name,
        type: activity.type,
        date: activity.start_date_local,
        duration: activity.moving_time,
        distanceKm: activity.distance ? Math.round((activity.distance / 1000) * 100) / 100 : undefined,
        avgWatts: activity.icu_average_watts,
        maxWatts: activity.icu_max_watts || activity.max_watts,
        normalizedPower: activity.icu_weighted_avg_watts,
        avgHr: activity.average_heartrate,
        maxHr: activity.max_heartrate,
        tss: activity.icu_training_load,
        intensity: Math.round((activity.icu_intensity || 0) * 10) / 10,
        decoupling: activity.decoupling != null ? Math.round(activity.decoupling * 10) / 10 : undefined,
        feel: activity.feel,
        rpe: activity.icu_rpe,
        // Cadence fields
        avgCadence: activity.average_cadence ? Math.round(activity.average_cadence) : undefined,
        maxCadence: maxCadenceFromIntervals > 0 ? Math.round(maxCadenceFromIntervals) : undefined,
        // Left/Right pedal balance (if available) - formatted for AI readability
        // avg_lr_balance from Intervals.icu represents RIGHT leg percentage
        // UI shows LEFT as (100 - avg_lr_balance) and RIGHT as avg_lr_balance
        leftRightBalance: activity.avg_lr_balance > 0 && activity.avg_lr_balance < 100 
          ? `${(100 - activity.avg_lr_balance).toFixed(1)}% left / ${activity.avg_lr_balance.toFixed(1)}% right` 
          : undefined,
        // Running-specific fields (pace, stride)
        paceMinKm: isRunning ? formatPaceForAI(activity.pace) : undefined,
        avgStrideM: isRunning && activity.average_stride ? Math.round(activity.average_stride * 100) / 100 : undefined,
        // Elevation
        elevationGain: activity.total_elevation_gain ? Math.round(activity.total_elevation_gain) : undefined
      };
      
      // Create compact interval summary from icu_intervals
      if (activity.icu_intervals && Array.isArray(activity.icu_intervals)) {
        const intervals = activity.icu_intervals
          .filter(interval => {
            const duration = interval.moving_time || interval.elapsed_time || 0;
            if (duration <= 0) return false;
            // If watts data exists, it must be > 0; intervals without watts (e.g. running with HR/pace) are included
            if (interval.average_watts !== undefined && interval.average_watts !== null && interval.average_watts <= 0) return false;
            return true;
          })
          .map(interval => ({
            duration_sec: interval.moving_time || interval.elapsed_time,
            avg_watts: interval.average_watts ? Math.round(interval.average_watts) : undefined,
            max_watts: interval.max_watts ? Math.round(interval.max_watts) : undefined,
            avg_hr: interval.average_heartrate ? Math.round(interval.average_heartrate) : undefined,
            max_hr: interval.max_heartrate ? Math.round(interval.max_heartrate) : undefined,
            avg_cadence: interval.average_cadence ? Math.round(interval.average_cadence) : undefined,
            max_cadence: interval.max_cadence ? Math.round(interval.max_cadence) : undefined,
            zone: interval.zone
          }));
        
        if (intervals.length > 0) {
          activityData.interval_summary = {
            interval_count: intervals.length,
            intervals: intervals
          };
        }
      }
      
      return activityData;
    }),
    events: data.events?.map(event => ({
      id: event.id,
      name: event.name,
      category: event.category,
      startDate: event.start_date_local || event.start_date,
      endDate: event.end_date_local || event.end_date,
      description: event.description,
      trainingLoad: event.icu_training_load
    })),
    fitness: latestFitness,
    wellness: limitedWellness,
    weekDefinition: {
      weekStartsOn: 'Monday',
      weekEndsOn: 'Sunday'
    },
    weeklyVolumeLoadSummary,
    upcomingWorkouts: upcomingWorkouts.length > 0 ? upcomingWorkouts : undefined
  };
  
  return removeNullValues(minimalData);
};

export const fetchPerformanceData = async () => {
  try {
    const [ftpResponse, vo2Response] = await Promise.all([
      api.get('/performance/ftp/top3'),
      api.get('/performance/vo2max/top3')
    ]);
    
    return {
      top3Ftp: ftpResponse.data,
      top3Vo2Max: vo2Response.data
    };
  } catch (err) {
    // Silently fail - return empty data
    return { top3Ftp: [], top3Vo2Max: [] };
  }
};

export const processWeeklyData = (data) => {
  if (!data?.weeklyData) return null;
  
  return data.weeklyData.map(week => ({
    ...week,
    volumeColor: getVolumeColor(week.totalVolume),
    ageGroupInfo: getAgeGroupInfo(week.ageGroup)
  }));
};

export const formatActivityStats = (activity) => {
  return {
    name: activity.name,
    type: getSportCategory(activity.type),
    duration: formatDuration(activity.moving_time),
    avgPower: activity.icu_average_watts,
    maxPower: activity.icu_max_watts || activity.max_watts,
    avgHR: activity.average_heartrate,
    maxHR: activity.max_heartrate,
    tss: activity.icu_training_load,
    intensity: activity.icu_intensity,
    sportColor: getSportColorClasses(activity.type)
  };
};

export const calculatePerformanceMetrics = (ftpData, vo2Data) => {
  const top3Ftp = ftpData
    .sort((a, b) => b.ftp - a.ftp)
    .slice(0, 3)
    .map(activity => ({
      ...activity,
      date: new Date(activity.start_date_local).toLocaleDateString(),
      ftp: activity.ftp
    }));

  const top3Vo2Max = vo2Data
    .sort((a, b) => b.vo2max - a.vo2max)
    .slice(0, 3)
    .map(activity => ({
      ...activity,
      date: new Date(activity.start_date_local).toLocaleDateString(),
      vo2max: activity.vo2max
    }));

  return { top3Ftp, top3Vo2Max };
};
