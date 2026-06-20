// Calendar utility functions - pure functions without side effects
import { extractTSSFromName } from './workoutUtils';
import { formatHoursMinutes } from './dataUtils';

export const formatDate = (date) => {
  // Use local date to avoid timezone issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getMonthRange = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { oldest: formatDate(start), newest: formatDate(end) };
};

export const getDaysInMonth = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDay = firstDay.getDay();
  
  // Adjust for Monday start (0 = Monday, 6 = Sunday)
  const adjustedStartingDay = startingDay === 0 ? 6 : startingDay - 1;
  
  // Calculate previous month dates to show
  const prevMonth = new Date(year, month, 0);
  const prevMonthDays = prevMonth.getDate();
  const prevMonthToShow = adjustedStartingDay; // Number of days from previous month to show
  
  // Calculate next month dates to show
  const totalCells = Math.ceil((daysInMonth + adjustedStartingDay) / 7) * 7;
  const nextMonthToShow = totalCells - (daysInMonth + adjustedStartingDay);
  
  return { 
    daysInMonth, 
    adjustedStartingDay,
    prevMonthDays,
    prevMonthToShow,
    nextMonthToShow
  };
};

export const getCalendarDisplayRange = (date) => {
  const { daysInMonth, adjustedStartingDay } = getDaysInMonth(date);
  const year = date.getFullYear();
  const month = date.getMonth();
  
  // Calculate the first visible day (might be in previous month)
  const firstVisibleDate = new Date(year, month, 1 - adjustedStartingDay);
  
  // Calculate the total number of cells needed
  const totalCells = Math.ceil((daysInMonth + adjustedStartingDay) / 7) * 7;
  
  // Calculate the last visible day (might be in next month)
  const lastVisibleDate = new Date(year, month, daysInMonth + (totalCells - daysInMonth - adjustedStartingDay));
  
  return {
    oldest: formatDate(firstVisibleDate),
    newest: formatDate(lastVisibleDate)
  };
};

export const parseWorkoutDescription = (description) => {
  
  const lines = description.split('\n').filter(line => line.trim());
  const sections = [];
  let currentSection = { title: 'Workout', steps: [] };
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      currentSection.steps.push(trimmed.substring(1).trim());
    } else if (trimmed && !trimmed.includes('%') && !trimmed.match(/^\d+[xX]/)) {
      if (currentSection.steps.length > 0) {
        sections.push(currentSection);
        currentSection = { title: trimmed, steps: [] };
      } else {
        currentSection.title = trimmed;
      }
    } else if (trimmed) {
      currentSection.steps.push(trimmed);
    }
  });
  
  if (currentSection.steps.length > 0 || sections.length === 0) {
    sections.push(currentSection);
  }
  
  return sections;
};

export const getIntervalChartData = (intervals) => {
  if (!intervals || intervals.length === 0) return null;
  
  // Filter to only work intervals (type 'WORK' or has significant power)
  const workIntervals = intervals.filter(i => 
    i.type === 'WORK' || i.type === 'RECOVERY' || i.average_watts > 0
  );
  
  if (workIntervals.length === 0) return null;
  
  const maxPower = Math.max(...workIntervals.map(i => i.average_watts || 0));
  const totalDuration = workIntervals.reduce((sum, i) => sum + (i.elapsed_time || 0), 0);
  
  return workIntervals.map((interval, idx) => {
    const power = interval.average_watts || 0;
    const height = maxPower > 0 ? (power / maxPower) * 100 : 10;
    const duration = interval.elapsed_time || 60;
    const widthPercent = totalDuration > 0 ? (duration / totalDuration) * 100 : 10;
    
    const isRecovery = interval.type === 'RECOVERY' || power < (maxPower * 0.5);
    
    let color = 'bg-gray-400';
    const intensity = interval.intensity || (power / 200); // Approximate if no intensity
    if (intensity >= 1.0) color = 'bg-red-500';
    else if (intensity >= 0.9) color = 'bg-orange-500';
    else if (intensity >= 0.75) color = 'bg-yellow-500';
    else if (intensity >= 0.55) color = 'bg-green-500';
    else color = 'bg-blue-400';
    
    return {
      key: idx,
      className: `${color} ${isRecovery ? 'opacity-60' : ''}`,
      style: { 
        height: `${Math.max(height, 5)}%`, 
        width: `${widthPercent}%`,
        minWidth: '2px'
      }
    };
  });
};

// Helper function to calculate ISO week number from a date
const getISOWeekNumber = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Set to Thursday of this week (ISO week starts on Monday, Thursday determines the week number)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNumber;
};

export const calculateWeeklyTotals = (year, month, weekNumber, activities, events, pendingEvents) => {
    
  // Calculate week boundaries to match calendar display exactly
  const firstDay = new Date(year, month, 1);
  const startingDay = firstDay.getDay();
  const adjustedStartingDay = startingDay === 0 ? 6 : startingDay - 1;
  
  // Calculate the start date of the given week
  // The calendar displays weeks starting from the first Monday that includes the month
  const weekStart = new Date(firstDay);
  weekStart.setDate(firstDay.getDate() - adjustedStartingDay + (weekNumber * 7) + 1);
  
  // Calculate ISO week number for this week
  const isoWeekNumber = getISOWeekNumber(weekStart);
  
  // Calculate actual ISO week start (Monday)
  const actualWeekStart = new Date(weekStart);
  const dayOfWeek = actualWeekStart.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday -> 6 days back, else back to Monday
  actualWeekStart.setDate(actualWeekStart.getDate() - daysToMonday);
  
  // Use actual ISO week start (Monday) instead of calendar week start
  const isoWeekStart = new Date(actualWeekStart);
  
  // Calculate the end of the week (Sunday)
  const weekEnd = new Date(isoWeekStart);
  weekEnd.setDate(isoWeekStart.getDate() + 6);
  
  let totalSeconds = 0;
  let totalTSS = 0;
  let totalDistance = 0;
  let totalElevation = 0;
  let isDeloadWeek = false;
  
  // Track daily totals for the week
  const dailyTotals = {};
  
  // Initialize all days of the week (use local date format)
  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(isoWeekStart);
    currentDay.setDate(isoWeekStart.getDate() + i);
    const dateStr = `${currentDay.getFullYear()}-${String(currentDay.getMonth() + 1).padStart(2, '0')}-${String(currentDay.getDate()).padStart(2, '0')}`;
    dailyTotals[dateStr] = { seconds: 0, tss: 0, distance: 0, elevation: 0, activities: [] };
  }
  
  // Get today's date for comparison (use local date to match intervals.icu)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Get week start and end dates for filtering
  const weekStartStr = `${isoWeekStart.getFullYear()}-${String(isoWeekStart.getMonth() + 1).padStart(2, '0')}-${String(isoWeekStart.getDate()).padStart(2, '0')}`;
  const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
  
    
  // Collect activity dates within this week (past/today = actual training)
  const activityDatesInWeek = new Set();
  
  // Process completed activities for past/today dates
  activities.forEach(activity => {
    if (activity.start_date_local) {
      const dateStr = activity.start_date_local.substring(0, 10);
      if (dateStr >= weekStartStr && dateStr <= weekEndStr && dateStr <= today) {
        activityDatesInWeek.add(dateStr);
        const activitySeconds = activity.moving_time || 0;
        const activityTSS = activity.icu_training_load || 0;
        const activityDistance = activity.distance || 0;
        const activityElevation = activity.total_elevation_gain || 0;

        totalSeconds += activitySeconds;
        totalTSS += activityTSS;
        totalDistance += activityDistance;
        totalElevation += activityElevation;

        dailyTotals[dateStr].seconds += activitySeconds;
        dailyTotals[dateStr].tss += activityTSS;
        dailyTotals[dateStr].distance += activityDistance;
        dailyTotals[dateStr].elevation += activityElevation;
        dailyTotals[dateStr].activities.push({
          name: activity.name,
          seconds: activitySeconds,
          tss: activityTSS,
          distance: activityDistance,
          elevation: activityElevation
        });
      }
    }
  });
  
  // Process events only for future dates (planned training) or deload markers
  events.forEach(event => {
    if (event.start_date_local) {
      const dateStr = event.start_date_local.substring(0, 10);
      if (dateStr >= weekStartStr && dateStr <= weekEndStr) {
        if (event.isDeloadWeek) {
          isDeloadWeek = true;
        }
        // Only count time/TSS for future dates without completed activities
        if (dateStr > today && !activityDatesInWeek.has(dateStr)) {
          const eventSeconds = event.moving_time || 0;
          const eventTSS = event.icu_training_load || extractTSSFromName(event.name) || 0;
          const eventDistance = event.distance || 0;
          const eventElevation = event.total_elevation_gain || 0;

          totalSeconds += eventSeconds;
          totalTSS += eventTSS;
          totalDistance += eventDistance;
          totalElevation += eventElevation;

          dailyTotals[dateStr].seconds += eventSeconds;
          dailyTotals[dateStr].tss += eventTSS;
          dailyTotals[dateStr].distance += eventDistance;
          dailyTotals[dateStr].elevation += eventElevation;
          dailyTotals[dateStr].activities.push({
            name: event.name,
            seconds: eventSeconds,
            tss: eventTSS,
            distance: eventDistance,
            elevation: eventElevation,
            type: 'event'
          });
        }
      }
    }
  });
  
  // Process pending events only for future dates without completed activities
  pendingEvents.forEach(event => {
    if (event.start_date_local) {
      const dateStr = event.start_date_local.substring(0, 10);
      if (dateStr >= weekStartStr && dateStr <= weekEndStr) {
        if (event.isDeloadWeek) {
          isDeloadWeek = true;
        }
        if (dateStr > today && !activityDatesInWeek.has(dateStr)) {
          const eventSeconds = event.moving_time || 0;
          const eventTSS = event.icu_training_load || extractTSSFromName(event.name) || 0;
          const eventDistance = event.distance || 0;
          const eventElevation = event.total_elevation_gain || 0;

          totalSeconds += eventSeconds;
          totalTSS += eventTSS;
          totalDistance += eventDistance;
          totalElevation += eventElevation;

          dailyTotals[dateStr].seconds += eventSeconds;
          dailyTotals[dateStr].tss += eventTSS;
          dailyTotals[dateStr].distance += eventDistance;
          dailyTotals[dateStr].elevation += eventElevation;
          dailyTotals[dateStr].activities.push({
            name: event.name,
            seconds: eventSeconds,
            tss: eventTSS,
            distance: eventDistance,
            elevation: eventElevation,
            type: 'pending'
          });
        }
      }
    }
  });
  
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMinutes = Math.floor((totalSeconds % 3600) / 60);
  const distanceKm = (totalDistance / 1000).toFixed(1);
  const elevationM = Math.round(totalElevation);

  return {
    hours: totalHours + (totalMinutes / 60),
    tss: Math.round(totalTSS),
    distance: parseFloat(distanceKm),
    elevation: elevationM,
    displayText: `${formatHoursMinutes(totalSeconds)} / ${Math.round(totalTSS)}TSS`,
    isDeloadWeek,
    isoWeekNumber
  };
};
