import api from '../api/axios';
import { getCalendarDisplayRange } from '../utils/calendarUtils';

// Custom hook for calendar event handlers
export const useCalendarEventHandlers = (
  selectedEvent,
  setSelectedEvent,
  setActivityDetails,
  setDetailsLoading,
  setIsDeleting,
  setConfirmDialog,
  setAlertDialog,
  setPendingEvents,
  currentDate,
  refreshCalendarData,
  setEvents,
  setActivities
) => {
  const handleEventClick = async (item) => {
    setSelectedEvent(item);
    setActivityDetails(null);

    // If this is a completed activity, fetch its details including icu_intervals
    if (item.isCompleted && item.id) {
      setDetailsLoading(true);
      try {
        const response = await api.get(`/statistics/activity/${item.id}`);
        setActivityDetails(response.data);
      } catch (err) {
        setActivityDetails(null);
      } finally {
        setDetailsLoading(false);
      }
    }
  };

  const handleDeleteEvent = async (pendingEvents) => {
    if (!selectedEvent) return;

    const confirmed = await new Promise((resolve) => {
      setConfirmDialog({
        show: true,
        title: selectedEvent.isCompleted ? 'Delete Activity' : 'Delete Workout',
        message: `Are you sure you want to delete "${selectedEvent.name}"?`,
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

    setIsDeleting(true);
    try {
      // Check if this is a pending event (not yet committed to intervals.icu)
      const isPendingEvent = selectedEvent.isPending || pendingEvents.some(e =>
        e.start_date_local === selectedEvent.start_date_local &&
        e.name === selectedEvent.name
      );

      if (isPendingEvent) {
        // Remove from pending events only (getItemsForDay handles display)
        setPendingEvents(prev => prev.filter(e =>
          !(e.start_date_local === selectedEvent.start_date_local && e.name === selectedEvent.name)
        ));
      } else if (selectedEvent.isCompleted) {
        // This is a completed activity - delete via activity API
        await api.delete(`/statistics/activity/${selectedEvent.id}`);

        // Refresh calendar to ensure UI is updated
        const { oldest, newest } = getCalendarDisplayRange(currentDate);
        await refreshCalendarData(oldest, newest);

        // Explicitly update local state to remove the deleted activity
        setActivities(prev => prev.filter(a => a.id !== selectedEvent.id));
      } else {
        // This is a committed event - delete from intervals.icu
        await api.delete(`/statistics/calendar/event/${selectedEvent.id}`);

        // Refresh calendar to ensure UI is updated
        const { oldest, newest } = getCalendarDisplayRange(currentDate);
        await refreshCalendarData(oldest, newest);

        // Explicitly update local state to remove the deleted event
        setEvents(prev => prev.filter(e => e.id !== selectedEvent.id));
      }

      // Close modal
      setSelectedEvent(null);
    } catch (err) {
      setAlertDialog({
        show: true,
        title: 'Error',
        message: 'Could not delete the workout. Please try again.'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEventsCreated = async (newEvents) => {
    // Add generated events to pending list
    // These are shown in calendar via getItemsForDay() which merges pendingEvents
    setPendingEvents(prev => [...prev, ...newEvents]);

    // Also remove any existing events that conflict with the new events
    // This ensures the calendar display refreshes to show replaced workouts
    setEvents(prev => {
      return prev.filter(existingEvent => {
        // Check if this existing event conflicts with any new event
        const hasConflict = newEvents.some(newEvent => {
          const existingDate = existingEvent.start_date_local?.substring(0, 10);
          const newDate = newEvent.start_date_local?.substring(0, 10);
          return existingDate === newDate && existingEvent.name === newEvent.name;
        });
        return !hasConflict;
      });
    });
  };

  return {
    handleEventClick,
    handleDeleteEvent,
    handleEventsCreated
  };
};
