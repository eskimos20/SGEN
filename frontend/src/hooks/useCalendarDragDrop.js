import { useState } from 'react';
import api from '../api/axios';
import { getCalendarDisplayRange } from '../utils/calendarUtils';

// Custom hook for calendar drag and drop functionality
export const useCalendarDragDrop = (currentDate, setEvents, setPendingEvents, setAlertDialog, refreshCalendarData) => {
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [dropTargetDay, setDropTargetDay] = useState(null);

  const handleDragStart = (e, event) => {
    // Only allow dragging planned events (not completed activities)
    if (event.isCompleted) {
      e.preventDefault();
      return;
    }
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', event.id);
  };

  const handleDragOver = (e, dateInfo) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedEvent) {
      setDropTargetDay(dateInfo);
    }
  };

  const handleDragLeave = (e) => {
    // Only remove drop target if we're actually leaving the day cell
    // Check if the related target is outside the current element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTargetDay(null);
    }
  };

  const handleDrop = async (e, dateInfo) => {
    e.preventDefault();
    setDropTargetDay(null);
    
    if (!draggedEvent) return;
    
    const { year, month, day } = dateInfo;
    const newDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Check if target date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(year, month, day);
    if (targetDate < today) {
      setDraggedEvent(null);
      setAlertDialog({
        show: true,
        title: 'Cannot move',
        message: 'Cannot move workouts to dates in the past.'
      });
      return;
    }
    
    // Don't do anything if dropped on the same day
    const currentEventDate = draggedEvent.start_date_local?.substring(0, 10);
    if (currentEventDate === newDateStr) {
      setDraggedEvent(null);
      return;
    }
    
    // Check if this is a pending event
    if (draggedEvent.isPending) {
      // Just update the date in pendingEvents state
      setPendingEvents(prev => prev.map(event => 
        event === draggedEvent
          ? { ...event, start_date_local: `${newDateStr}T00:00:00` }
          : event
      ));
      setDraggedEvent(null);
      return;
    }
    
    try {
      // Update event on Intervals.icu via our API
      // Intervals.icu requires date format: yyyy-MM-ddT00:00:00
      await api.put(`/statistics/calendar/event/${draggedEvent.id}`, {
        start_date_local: `${newDateStr}T00:00:00`
      });
      
      // Update local state
      setEvents(prev => prev.map(event => 
        event.id === draggedEvent.id 
          ? { ...event, start_date_local: `${newDateStr}T00:00:00` }
          : event
      ));
      
      // Refresh calendar data to ensure UI is updated immediately
      if (refreshCalendarData) {
        const { oldest, newest } = getCalendarDisplayRange(currentDate);
        await refreshCalendarData(oldest, newest);
      }
    } catch (err) {
      console.error('Failed to move event:', err);
      setAlertDialog({
        show: true,
        title: 'Error',
        message: 'Could not move the workout. Please try again.'
      });
    } finally {
      setDraggedEvent(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
    setDropTargetDay(null);
  };

  return {
    draggedEvent,
    dropTargetDay,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd
  };
};
