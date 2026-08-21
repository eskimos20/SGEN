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
  setActivities,
  setStravaData,
  setStravaLoading,
  hasStravaToken
) => {
  const handleEventClick = async (item) => {
    setSelectedEvent(item);
    setActivityDetails(null);
    setStravaData(null);
    
    // If this is a completed activity, fetch its details including icu_intervals
    if (item.isCompleted && item.id) {
      setDetailsLoading(true);
      
      // Only set Strava loading if user has Strava connected
      if (hasStravaToken) {
        setStravaLoading(true);
      }
      
      try {
        // Step 1: Build array of promises to fetch in parallel (Intervals + basic Strava)
        const promises = [
          // Intervals.icu activity details (always fetch)
          api.get(`/statistics/activity/${item.id}`)
        ];
        
        // Only fetch Strava data if user has Strava connected and activity has start_date
        let stravaPhotosPromise = null;
        let stravaSegmentsPromise = null;
        
        if (hasStravaToken && item.start_date) {
          const startDate = Math.floor(new Date(item.start_date).getTime() / 1000);
          
          stravaPhotosPromise = api.get('/strava/photos/by-date', {
            params: { startDate, toleranceSeconds: 300 }
          });
          stravaSegmentsPromise = api.get('/strava/segments/by-date', {
            params: { startDate, toleranceSeconds: 300 }
          });
          
          promises.push(stravaPhotosPromise, stravaSegmentsPromise);
        }
        
        // Fetch all data in parallel
        const responses = await Promise.allSettled(promises);
        
        // Extract results - first is always Intervals, rest are Strava (if fetched)
        const intervalsResponse = responses[0];
        const stravaPhotosResponse = hasStravaToken && item.start_date ? responses[1] : { status: 'fulfilled', value: { data: { found: false, photos: [] } } };
        const stravaSegmentsResponse = hasStravaToken && item.start_date ? responses[2] : { status: 'fulfilled', value: { data: { found: false, segments: [] } } };

        // Set Intervals data
        if (intervalsResponse.status === 'fulfilled') {
          setActivityDetails(intervalsResponse.value.data);
        } else {
          setActivityDetails(null);
        }

        // Process Strava photos
        const photosData = stravaPhotosResponse.status === 'fulfilled' 
          ? stravaPhotosResponse.value.data 
          : { found: false, photos: [], error: stravaPhotosResponse.reason?.response?.data };
        
        // Process Strava segments
        const segmentsData = stravaSegmentsResponse.status === 'fulfilled'
          ? stravaSegmentsResponse.value.data
          : { found: false, segments: [], error: stravaSegmentsResponse.reason?.response?.data };
        
        // Step 2: Batch-fetch PR data for ALL segments in parallel via single backend call
        let segmentPRs = {};
        if (hasStravaToken && segmentsData.found && segmentsData.segments && segmentsData.segments.length > 0) {
          const segmentIds = segmentsData.segments
            .map(e => e.segment?.id)
            .filter(Boolean);
          
          if (segmentIds.length > 0) {
            try {
              const batchResponse = await api.post('/strava/segments/batch-pr', { segmentIds });
              const batchData = batchResponse.data || {};
              // Normalize: backend returns { "segmentId": { prTime, prWatts, komTime, qomTime, hasPR } }
              Object.entries(batchData).forEach(([id, pr]) => {
                segmentPRs[Number(id)] = {
                  time: pr.prTime,
                  watts: pr.prWatts,
                  komTime: pr.komTime,
                  qomTime: pr.qomTime,
                  hasPR: pr.hasPR
                };
              });
            } catch (err) {
              // Silent fail - PR data is optional
            }
          }
        }

        setStravaData({
          photos: photosData,
          segments: segmentsData,
          segmentPRs: segmentPRs,
          rateLimit: photosData.error?.error === 'rate_limit' || segmentsData.error?.error === 'rate_limit',
          rateLimitSeconds: photosData.error?.retryAfterSeconds || segmentsData.error?.retryAfterSeconds || 0
        });
        
      } catch (err) {
        // Failed to fetch details
        setActivityDetails(null);
        setStravaData(null);
      } finally {
        setDetailsLoading(false);
        setStravaLoading(false);
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
