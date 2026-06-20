import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

const CalendarContext = createContext(null);

export const CalendarProvider = ({ children }) => {
  const { user } = useAuth();
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarActivities, setCalendarActivities] = useState([]);
  const [calendarDateRange, setCalendarDateRange] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Clear calendar data when user logs out (user becomes null)
  useEffect(() => {
    if (!user) {
      setCalendarEvents([]);
      setCalendarActivities([]);
      setCalendarDateRange(null);
    }
  }, [user]);

  const refreshCalendarData = useCallback(async (oldest, newest) => {
    if (!oldest || !newest) {
      console.warn('Invalid date range provided to refreshCalendarData');
      return { events: [], activities: [] };
    }

    setCalendarLoading(true);
    try {
      const [eventsResponse, activitiesResponse] = await Promise.all([
        api.get('/statistics/calendar', { params: { oldest, newest } }),
        api.get('/statistics/calendar/activities', { params: { oldest, newest } })
      ]);
      
      // Replace data entirely (don't merge) to ensure deleted events are removed
      setCalendarEvents(eventsResponse.data || []);
      setCalendarActivities(activitiesResponse.data || []);
      setCalendarDateRange({ oldest, newest });
      
      // Return the new data
      return {
        events: eventsResponse.data || [],
        activities: activitiesResponse.data || []
      };
    } catch (err) {
      console.error('Failed to refresh calendar data:', err);
      // Clear data on error to prevent stale state
      setCalendarEvents([]);
      setCalendarActivities([]);
      setCalendarDateRange(null);
      return { events: [], activities: [] };
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const fetchCalendarData = useCallback(async (oldest, newest) => {
    if (!oldest || !newest) {
      console.warn('Invalid date range provided to fetchCalendarData');
      return { events: [], activities: [] };
    }

    setCalendarLoading(true);
    try {
      const [eventsResponse, activitiesResponse] = await Promise.all([
        api.get('/statistics/calendar', { params: { oldest, newest } }),
        api.get('/statistics/calendar/activities', { params: { oldest, newest } })
      ]);
      
      // Instead of replacing, merge with existing data to preserve adjacent month data
      setCalendarEvents(prev => {
        const newEvents = eventsResponse.data || [];
        // Combine existing and new events, removing duplicates
        const allEvents = [...prev, ...newEvents];
        const uniqueEvents = allEvents.filter((event, index, self) => 
          index === self.findIndex(e => e.id === event.id)
        );
        return uniqueEvents;
      });
      
      setCalendarActivities(prev => {
        const newActivities = activitiesResponse.data || [];
        // Combine existing and new activities, removing duplicates
        const allActivities = [...prev, ...newActivities];
        const uniqueActivities = allActivities.filter((activity, index, self) => 
          index === self.findIndex(a => a.id === activity.id)
        );
        return uniqueActivities;
      });
      
      // Update the date range to encompass both old and new ranges
      setCalendarDateRange(prev => {
        if (!prev) return { oldest, newest };
        return {
          oldest: prev.oldest < oldest ? prev.oldest : oldest,
          newest: prev.newest > newest ? prev.newest : newest
        };
      });
      
      // Return the new data (not filtered, let the service handle filtering)
      return {
        events: eventsResponse.data || [],
        activities: activitiesResponse.data || []
      };
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
      // Don't clear existing data on fetch error, just return empty result
      return { events: [], activities: [] };
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const getUpcomingWorkouts = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 14);
    const maxDateStr = maxDate.toISOString().split('T')[0];
    
    // Filter events to only include future workouts within 14 days (not notes, completed, or past)
    return calendarEvents
      .filter(event => event.category === 'WORKOUT' && 
                     event.start_date_local?.substring(0, 10) >= today &&
                     event.start_date_local?.substring(0, 10) <= maxDateStr)
      .map(event => ({
        name: event.name,
        date: event.start_date_local?.substring(0, 10),
        duration: event.moving_time,
        tss: event.icu_training_load,
        intensity: event.icu_intensity,
        isDeloadWeek: !!event.isDeloadWeek,
        isIntervalSession: !/endurance/i.test(event.name || ''),
        description: event.workoutDescription
      }));
  }, [calendarEvents]);

  const isDateRangeCovered = useCallback((oldest, newest) => {
    if (!calendarDateRange) return false;
    return calendarDateRange.oldest <= oldest && calendarDateRange.newest >= newest;
  }, [calendarDateRange]);

  const clearCalendarData = useCallback(() => {
    setCalendarEvents([]);
    setCalendarActivities([]);
    setCalendarDateRange(null);
  }, []);

  return (
    <CalendarContext.Provider value={{
      calendarEvents,
      calendarActivities,
      calendarDateRange,
      calendarLoading,
      fetchCalendarData,
      refreshCalendarData,
      getUpcomingWorkouts,
      isDateRangeCovered,
      clearCalendarData
    }}>
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = () => {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider');
  }
  return context;
};
