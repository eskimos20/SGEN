import { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';
import { getCalendarDisplayRange } from '../utils/calendarUtils';

/**
 * Custom hook for managing Calendar page state
 * Consolidates all useState hooks from Calendar.jsx
 */
export const useCalendarState = (currentDate, calendarEvents, calendarActivities) => {
  // Local calendar state
  const [events, setEvents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Training preferences
  const [trainingPreferences, setTrainingPreferences] = useState(null);
  
  // Delete range modal state
  const [showDeleteRange, setShowDeleteRange] = useState(false);
  const [deleteRange, setDeleteRange] = useState({ startDate: '', endDate: '' });
  const [isDeletingRange, setIsDeletingRange] = useState(false);
  
  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  
  // Add entry modals state
  const [showAddEntryType, setShowAddEntryType] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [selectedEntryType, setSelectedEntryType] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  
  // Move workout modal state
  const [showMoveWorkout, setShowMoveWorkout] = useState(false);
  const [workoutToMove, setWorkoutToMove] = useState(null);

  // Memoize filtered calendar data to prevent unnecessary re-filtering
  const filteredData = useMemo(() => {
    if (calendarEvents.length === 0 && calendarActivities.length === 0) {
      return { events: [], activities: [] };
    }
    
    try {
      const { oldest, newest } = getCalendarDisplayRange(currentDate);
      
      return {
        events: calendarEvents.filter(e => {
          const date = e.start_date_local?.substring(0, 10);
          return date >= oldest && date <= newest;
        }),
        activities: calendarActivities.filter(a => {
          const date = a.start_date_local?.substring(0, 10);
          return date >= oldest && date <= newest;
        })
      };
    } catch (err) {
      console.error('Error filtering calendar data:', err);
      return { events: [], activities: [] };
    }
  }, [calendarEvents, calendarActivities, currentDate]);

  // Update local state when filtered data changes
  useEffect(() => {
    setEvents(filteredData.events);
    setActivities(filteredData.activities);
  }, [filteredData]);

  // Load training preferences
  useEffect(() => {
    let isMounted = true;

    const loadTrainingPreferences = async () => {
      try {
        const response = await api.get('/statistics/training-preferences');
        if (isMounted) {
          setTrainingPreferences(response.data || null);
        }
      } catch (err) {
        if (isMounted) {
          setTrainingPreferences(null);
        }
      }
    };

    loadTrainingPreferences();
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    // Local calendar data
    events,
    setEvents,
    activities,
    setActivities,
    loading,
    setLoading,
    error,
    setError,
    
    // Training preferences
    trainingPreferences,
    setTrainingPreferences,
    
    // Delete range modal
    showDeleteRange,
    setShowDeleteRange,
    deleteRange,
    setDeleteRange,
    isDeletingRange,
    setIsDeletingRange,
    
    // Upload modal
    showUpload,
    setShowUpload,
    
    // Add entry modals
    showAddEntryType,
    setShowAddEntryType,
    showAddEntry,
    setShowAddEntry,
    selectedEntryType,
    setSelectedEntryType,
    selectedDate,
    setSelectedDate,
    
    // Move workout modal
    showMoveWorkout,
    setShowMoveWorkout,
    workoutToMove,
    setWorkoutToMove
  };
};
