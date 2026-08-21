import { useCallback } from 'react';
import api from '../api/axios';
import { getMonthRange, getCalendarDisplayRange } from '../utils/calendarUtils';
import { calculateWorkoutMetrics } from '../utils/workoutUtils';
import { 
  openScheduler, 
  handleCommitSchedule, 
  handleRegenerateWorkout 
} from '../services/calendarService';

// Constants
const FIRST_DAY_OF_MONTH = 1;

/**
 * Custom hook for Calendar page event handlers
 * Consolidates all handler functions from Calendar.jsx
 */
export const useCalendarHandlers = ({
  currentDate,
  calendarEvents,
  calendarActivities,
  events,
  setEvents,
  setActivities,
  pendingEvents,
  setPendingEvents,
  selectedCategoryPerDate,
  athleteProfile,
  setShowScheduler,
  setLoadingSchedulerData,
  setSchedulerData,
  setIsCommitting,
  setLoading,
  setRegeneratingDate,
  setAlertDialog,
  setConfirmDialog,
  setShowDeleteRange,
  setDeleteRange,
  setIsDeletingRange,
  setShowAddEntryType,
  setShowAddEntry,
  setSelectedDate,
  setSelectedEntryType,
  setShowMoveWorkout,
  setWorkoutToMove,
  fetchCalendarData,
  refreshCalendarData,
  isDateRangeCovered
}) => {

  // Navigate to previous/next month
  const navigateMonth = useCallback((direction) => {
    return (prevDate) => {
      const newDate = new Date(prevDate);
      newDate.setDate(FIRST_DAY_OF_MONTH); // Set to first day to avoid month overflow issues
      newDate.setMonth(newDate.getMonth() + direction);
      return newDate;
    };
  }, []);

  // Open delete range modal
  const openDeleteRange = useCallback(() => {
    const { oldest, newest } = getMonthRange(currentDate);
    setDeleteRange({ startDate: oldest, endDate: newest });
    setShowDeleteRange(true);
  }, [currentDate, setDeleteRange, setShowDeleteRange]);

  // Get candidates for deletion in date range
  const getDeleteRangeCandidates = useCallback(async (deleteRange) => {
    if (!deleteRange.startDate || !deleteRange.endDate) {
      return { rangeStart: '', rangeEnd: '', scheduledEvents: [], pendingEvents: [] };
    }

    const rangeStart = deleteRange.startDate <= deleteRange.endDate
      ? deleteRange.startDate
      : deleteRange.endDate;
    const rangeEnd = deleteRange.startDate <= deleteRange.endDate
      ? deleteRange.endDate
      : deleteRange.startDate;

    // Ensure we have data for the full selected range
    let eventsSource = calendarEvents;
    let activitiesSource = calendarActivities;
    if (!isDateRangeCovered(rangeStart, rangeEnd)) {
      const freshData = await fetchCalendarData(rangeStart, rangeEnd);
      const freshEvents = freshData.events || [];
      const freshActivities = freshData.activities || [];
      
      // Optimized deduplication
      const allEvents = [...calendarEvents, ...freshEvents];
      const eventsMap = new Map();
      allEvents.forEach(e => eventsMap.set(e.id, e));
      eventsSource = Array.from(eventsMap.values());
      
      const allActivities = [...calendarActivities, ...freshActivities];
      const activitiesMap = new Map();
      allActivities.forEach(a => activitiesMap.set(a.id, a));
      activitiesSource = Array.from(activitiesMap.values());
    }

    const completedKeys = new Set(
      activitiesSource
        .filter(activity => activity.start_date_local && activity.name)
        .map(activity => `${activity.start_date_local.substring(0, 10)}|${activity.name}`)
    );

    const scheduledEvents = eventsSource.filter(event => {
      const date = event.start_date_local?.substring(0, 10);
      if (!date || date < rangeStart || date > rangeEnd) return false;
      if (completedKeys.has(`${date}|${event.name}`)) return false;
      if (event.category && event.category !== 'WORKOUT') return false;
      return true;
    });

    const pendingInRange = pendingEvents.filter(event => {
      const date = event.start_date_local?.substring(0, 10);
      return date && date >= rangeStart && date <= rangeEnd;
    });

    return { rangeStart, rangeEnd, scheduledEvents, pendingEvents: pendingInRange };
  }, [calendarEvents, calendarActivities, pendingEvents, fetchCalendarData, isDateRangeCovered]);

  // Handle delete range
  const handleDeleteRange = useCallback(async (deleteRange) => {
    const { rangeStart, rangeEnd, scheduledEvents, pendingEvents: pendingInRange } = await getDeleteRangeCandidates(deleteRange);
    const totalCount = scheduledEvents.length + pendingInRange.length;

    if (!rangeStart || !rangeEnd) {
      setAlertDialog({
        show: true,
        title: 'Missing dates',
        message: 'Please select both a start and end date.'
      });
      return;
    }

    if (totalCount === 0) {
      setAlertDialog({
        show: true,
        title: 'No scheduled workouts',
        message: 'There are no scheduled workouts to remove in this period.'
      });
      return;
    }

    const confirmed = await new Promise((resolve) => {
      setConfirmDialog({
        show: true,
        title: 'Delete scheduled workouts',
        message: `Do you really want to remove ${totalCount} scheduled workouts in this period?`,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        confirmStyle: 'danger',
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

    setIsDeletingRange(true);
    try {
      if (pendingInRange.length > 0) {
        setPendingEvents(prev => prev.filter(event => !pendingInRange.some(toRemove =>
          toRemove.start_date_local === event.start_date_local && toRemove.name === event.name
        )));
      }

      if (scheduledEvents.length > 0) {
        for (const event of scheduledEvents) {
          if (event.id) {
            await api.delete(`/statistics/calendar/event/${event.id}`);
          }
        }
      }

      setEvents(prev => prev.filter(event => !scheduledEvents.some(toRemove => toRemove.id === event.id)));
      await refreshCalendarData(rangeStart, rangeEnd);

      setAlertDialog({
        show: true,
        title: 'Success',
        message: `${totalCount} scheduled workouts were removed.`
      });
      setShowDeleteRange(false);
    } catch (err) {
      setAlertDialog({
        show: true,
        title: 'Error',
        message: 'Could not delete scheduled workouts. Please try again.'
      });
    } finally {
      setIsDeletingRange(false);
    }
  }, [getDeleteRangeCandidates, setAlertDialog, setConfirmDialog, setIsDeletingRange, setPendingEvents, setEvents, refreshCalendarData, setShowDeleteRange]);

  // Handle empty day click
  const handleEmptyDayClick = useCallback((dateInfo) => {
    const year = dateInfo.year;
    const month = dateInfo.month;
    const day = dateInfo.day;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setShowAddEntryType(true);
  }, [setSelectedDate, setShowAddEntryType]);

  // Handle entry type select
  const handleEntryTypeSelect = useCallback((entryType) => {
    setSelectedEntryType(entryType);
    setShowAddEntryType(false);
    setShowAddEntry(true);
  }, [setSelectedEntryType, setShowAddEntryType, setShowAddEntry]);

  // Handle entry created
  const handleEntryCreated = useCallback(async () => {
    const { oldest, newest } = getCalendarDisplayRange(currentDate);
    await fetchCalendarData(oldest, newest);
  }, [currentDate, fetchCalendarData]);

  // Handle commit schedule
  const handleCommitScheduleLocal = useCallback(async () => {
    await handleCommitSchedule(
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
    );
  }, [pendingEvents, events, currentDate, refreshCalendarData, setIsCommitting, setLoading, setEvents, setActivities, setPendingEvents, setAlertDialog, setConfirmDialog]);

  // Handle regenerate workout
  const handleRegenerateWorkoutLocal = useCallback(async (dateStr, category = null) => {
    await handleRegenerateWorkout(
      dateStr,
      category,
      selectedCategoryPerDate,
      pendingEvents,
      athleteProfile,
      setRegeneratingDate,
      setPendingEvents,
      setAlertDialog,
      calculateWorkoutMetrics
    );
  }, [selectedCategoryPerDate, pendingEvents, athleteProfile, setRegeneratingDate, setPendingEvents, setAlertDialog]);

  // Handle move workout
  const handleMoveWorkout = useCallback(async (workout, newDateStr) => {
    try {
      // Check if this is a pending event
      if (workout.isPending) {
        setPendingEvents(prev => prev.map(event => 
          event === workout
            ? { ...event, start_date_local: `${newDateStr}T00:00:00` }
            : event
        ));
        setShowMoveWorkout(false);
        setWorkoutToMove(null);
        return;
      }
      
      // Update event on Intervals.icu
      await api.put(`/statistics/calendar/event/${workout.id}`, {
        start_date_local: `${newDateStr}T00:00:00`
      });
      
      // Update local state
      setEvents(prev => prev.map(event => 
        event.id === workout.id 
          ? { ...event, start_date_local: `${newDateStr}T00:00:00` }
          : event
      ));
      
      // Refresh calendar data
      const { oldest, newest } = getCalendarDisplayRange(currentDate);
      await refreshCalendarData(oldest, newest);
      
      setShowMoveWorkout(false);
      setWorkoutToMove(null);
    } catch (err) {
      console.error('Failed to move workout:', err);
      setAlertDialog({
        show: true,
        title: 'Error',
        message: 'Could not move the workout. Please try again.'
      });
    }
  }, [setPendingEvents, setShowMoveWorkout, setWorkoutToMove, setEvents, currentDate, refreshCalendarData, setAlertDialog]);

  // Handle open scheduler
  const handleOpenScheduler = useCallback(() => {
    openScheduler(setShowScheduler, setLoadingSchedulerData, setSchedulerData);
  }, [setShowScheduler, setLoadingSchedulerData, setSchedulerData]);

  return {
    navigateMonth,
    openDeleteRange,
    handleDeleteRange,
    handleEmptyDayClick,
    handleEntryTypeSelect,
    handleEntryCreated,
    handleCommitScheduleLocal,
    handleRegenerateWorkoutLocal,
    handleMoveWorkout,
    handleOpenScheduler
  };
};
