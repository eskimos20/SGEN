import api from '../api/axios';
import { fetchSchedulerData } from '../utils/fitnessService';
import { getMonthRange, getCalendarDisplayRange } from '../utils/calendarUtils';

// Calendar API service functions

export const fetchCalendarEvents = async (currentDate, calendarEvents, calendarActivities, isDateRangeCovered, fetchCalendarData, setEvents, setActivities, setLoading, setError) => {
  // Use the extended range that includes previous/next month visible days
  const { oldest, newest } = getCalendarDisplayRange(currentDate);
  
  // Check if we already have data for this range from shared context
  const hasData = isDateRangeCovered(oldest, newest);
  
  if (hasData) {
    // Filter context data for the visible range
    const filteredEvents = calendarEvents.filter(e => {
      const date = e.start_date_local?.substring(0, 10);
      return date >= oldest && date <= newest;
    });
    const filteredActivities = calendarActivities.filter(a => {
      const date = a.start_date_local?.substring(0, 10);
      return date >= oldest && date <= newest;
    });
    setEvents(filteredEvents);
    setActivities(filteredActivities);
    setLoading(false);
    return;
  }
  
  // Otherwise fetch fresh data for the extended range
  setLoading(true);
  setError(null);
  try {
    await fetchCalendarData(oldest, newest);
    
    // After fetching, the context will be updated with merged data
    // The useEffect will trigger again with the updated context data
    // and will filter the data correctly
  } catch (err) {
    if (err.response?.status === 403) {
      console.error('📅 CalendarService: 403 Forbidden - authentication/authorization issue');
      setError('Access denied. Please check your permissions and try logging in again.');
    } else if (err.response?.status === 401) {
      console.error('📅 CalendarService: 401 Unauthorized - need to re-authenticate');
      setError('Session expired. Please log in again.');
    } else {
      setError('Failed to load calendar data. Please try again.');
    }
    setEvents([]);
    setActivities([]);
  } finally {
    setLoading(false);
  }
};

export const fetchAthleteProfile = async (setAthleteProfile) => {
  try {
    const response = await api.get('/statistics/athlete-profile');
    setAthleteProfile(response.data);
  } catch (err) {
    console.warn('Could not fetch athlete profile:', err?.response?.status ?? err?.message);
  }
};

export const openScheduler = async (setShowScheduler, setLoadingSchedulerData, setSchedulerData) => {
  setShowScheduler(true);
  setLoadingSchedulerData(true);
  
  try {
    const data = await fetchSchedulerData();
    setSchedulerData(data);
  } finally {
    setLoadingSchedulerData(false);
  }
};

export const handleCommitSchedule = async (
  pendingEvents, 
  events, 
  currentDate, 
  refreshCalendarData, 
  setIsCommitting, 
  setLoading, 
  setEvents, 
  setActivities, 
  setPendingEvents, 
  setAlertDialog, 
  setConfirmDialog,
  getCalendarDisplayRange
) => {
  if (pendingEvents.length === 0) return;

  // Check if any pending events conflict with existing events
  // Optimized: Use Map for O(n) instead of nested loop O(n²)
  const conflictingDates = new Set();
  const eventsToDelete = [];
  
  // Build a map of existing workout events by date for O(1) lookup
  const existingWorkoutsByDate = new Map();
  events.forEach(existingEvent => {
    if (existingEvent.category !== 'WORKOUT' || !existingEvent.id) return;
    const existingDate = existingEvent.start_date_local?.split('T')[0];
    if (existingDate && !pendingEvents.includes(existingEvent)) {
      if (!existingWorkoutsByDate.has(existingDate)) {
        existingWorkoutsByDate.set(existingDate, []);
      }
      existingWorkoutsByDate.get(existingDate).push(existingEvent.id);
    }
  });
  
  // Check pending events against the map
  pendingEvents.forEach(pendingEvent => {
    const pendingDate = pendingEvent.start_date_local?.split('T')[0];
    if (pendingDate && existingWorkoutsByDate.has(pendingDate)) {
      conflictingDates.add(pendingDate);
      eventsToDelete.push(...existingWorkoutsByDate.get(pendingDate));
    }
  });

  // Show confirmation if there are conflicts
  if (conflictingDates.size > 0) {
    const dateList = Array.from(conflictingDates).sort().join(', ');
    const confirmed = await new Promise((resolve) => {
      setConfirmDialog({
        show: true,
        title: 'Replace existing workouts?',
        message: `There are already workouts on the following dates: ${dateList}\n\nThese workouts will be deleted and replaced with the new ones.`,
        onConfirm: () => {
          setConfirmDialog({ show: false, title: '', message: '', onConfirm: null });
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog({ show: false, title: '', message: '', onConfirm: null });
          resolve(false);
        }
      });
    });
    if (!confirmed) return;
  }

  setIsCommitting(true);
  try {
    // Clean up events - remove metadata fields that are not part of intervals.icu schema
    const cleanedEvents = pendingEvents.map(event => {
      const { category, hardCategories, enduranceMaxMin, intervalMaxMin, isPending, originalMaxDuration, type, ...cleanEvent } = event;
      return cleanEvent;
    });
    
    const response = await api.post('/statistics/calendar/events/batch', {
      events: cleanedEvents,
      deleteEventIds: eventsToDelete
    });

    const createdCount = response.data.createdCount || response.data.created?.length || pendingEvents.length;
    const deletedCount = response.data.deletedCount || 0;
    
    setAlertDialog({
      show: true,
      title: 'Success',
      message: deletedCount > 0
        ? `${deletedCount} existing workouts were replaced and ${createdCount} new workouts have been uploaded to intervals.icu!`
        : `${createdCount} workouts have been uploaded to intervals.icu!`
    });

    // Clear pending events and refresh calendar
    setPendingEvents([]);
    const { oldest, newest } = getCalendarDisplayRange(currentDate);
    setLoading(true);
    await refreshCalendarData(oldest, newest);
    // Don't set local state here - let the Calendar component's useEffect handle it
    // The context will be updated and the useEffect in Calendar.jsx will update local state
  } catch (err) {
    setAlertDialog({
      show: true,
      title: 'Error',
      message: '❌ Could not upload workouts to intervals.icu. Please try again.'
    });
  } finally {
    setIsCommitting(false);
    setLoading(false);
  }
};

export const handleRegenerateWorkout = async (
  dateStr, 
  category, 
  selectedCategoryPerDate, 
  pendingEvents, 
  athleteProfile, 
  setRegeneratingDate, 
  setPendingEvents, 
  setAlertDialog,
  calculateWorkoutMetrics
) => {
  setRegeneratingDate(dateStr);
  try {
    // Use provided category or get from selected category state
    const workoutCategory = category || selectedCategoryPerDate[dateStr] || 'Endurance';

    // Get the original event to retrieve the original max duration
    const originalEvent = pendingEvents.find(e => e.start_date_local?.substring(0, 10) === dateStr);
    
    // Use the original maxDuration that was set when the workout was first created
    // This ensures regenerate uses the same duration range as the original generation
    const targetDuration = originalEvent?.originalMaxDuration || 60;
    
    // Get the original activity type to ensure regenerate uses the same sport
    const activityType = originalEvent?.activityType || 'Cycling';

    // Build workout request for this date
    const workoutRequest = {
      date: dateStr,
      category: workoutCategory,
      maxDuration: targetDuration,
      activityType: activityType
    };

    // Call backend to generate random workout
    const response = await api.post('/statistics/generate-random-workouts', {
      workouts: [workoutRequest]
    });

    const events = response.data.events || [];
    
    if (events.length > 0) {
      const newEvent = events[0];
      
      // Use the activityType we sent to backend (not what backend returns) to determine correct FTP
      // Handle all variants of running (Running, Run, run)
      const isRunning = (activityType === 'Running' || activityType === 'Run' || activityType === 'run');
      
      // Get FTP from sportSettings instead of athleteProfile
      let runningFtp = 240; // default
      let cyclingFtp = 275; // default
      
      if (athleteProfile?.sportSettings && Array.isArray(athleteProfile.sportSettings)) {
        const runningSettings = athleteProfile.sportSettings.find(setting => 
          setting.types && setting.types.some(type => type === 'Run')
        );
        const cyclingSettings = athleteProfile.sportSettings.find(setting => 
          setting.types && setting.types.some(type => type === 'Ride')
        );
        
        runningFtp = runningSettings?.ftp || 240;
        cyclingFtp = cyclingSettings?.ftp || 275;
      }
      
      const ftp = isRunning ? runningFtp : cyclingFtp;
      
      const metrics = calculateWorkoutMetrics(newEvent.workout_doc, ftp);
      
      // Preserve metadata from original event
      const eventWithMetrics = { 
        ...newEvent, 
        ...metrics,
        category: workoutCategory, // Set the category that was used for generation
        hardCategories: originalEvent?.hardCategories || [],
        isDeloadWeek: originalEvent?.isDeloadWeek || false,
        originalMaxDuration: originalEvent?.originalMaxDuration || targetDuration,
        activityType: activityType // Preserve the activityType for future regenerates
      };

      // Remove old event for this date from pendingEvents and add new one
      setPendingEvents(prev => {
        const filtered = prev.filter(e => e.start_date_local?.substring(0, 10) !== dateStr);
        return [...filtered, eventWithMetrics];
      });
    }
  } catch (err) {
    console.error('Failed to regenerate workout:', err);
    setAlertDialog({
      show: true,
      title: 'Error',
      message: '❌ Could not regenerate workout. Please try again.'
    });
  } finally {
    setRegeneratingDate(null);
  }
};
