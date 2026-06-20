/**
 * Shared utility for computing calendar day items.
 * Used by Calendar.jsx (getItemsForDay, getItemsForAnyDay) and useCalendarMobileNavigation.
 */

/**
 * Get all display items (activities, events, pending events) for a specific date.
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {Array} activities - Completed activities
 * @param {Array} events - Planned events from intervals.icu
 * @param {Array} pendingEvents - Locally pending (not yet committed) events
 * @returns {Array} Merged and deduplicated items for the day
 */
export const getItemsForDate = (dateStr, activities, events, pendingEvents) => {
  const today = new Date().toISOString().split('T')[0];
  const isPastDate = dateStr < today;

  // Get completed activities for this day (all completed activities for past dates)
  const dayActivities = activities.filter(activity => {
    if (!activity.start_date_local) return false;
    return activity.start_date_local.substring(0, 10) === dateStr;
  }).map(a => ({ ...a, isCompleted: true }));

  // For past dates, show completed activities and non-workout events
  if (isPastDate) {
    const dayEvents = events.filter(event => {
      if (!event.start_date_local) return false;
      
      // For past dates, only show non-workout events (SICK, NOTE, etc.)
      // Don't show planned workout events on past dates
      if (event.category === 'WORKOUT') {
        return false;
      }
      
      const eventStartDate = event.start_date_local.substring(0, 10);
      let eventEndDate = eventStartDate;
      
      if (event.end_date_local) {
        eventEndDate = event.end_date_local.substring(0, 10);
        // If end_date_local has T00:00:00, subtract 1 day to get correct display range
        // because Intervals.icu interprets YYYY-MM-DDT00:00:00 as end of previous day
        if (event.end_date_local.endsWith('T00:00:00')) {
          const endDateObj = new Date(eventEndDate);
          endDateObj.setDate(endDateObj.getDate() - 1);
          eventEndDate = endDateObj.toISOString().split('T')[0];
        }
      }
      
      const isDateInRange = event.end_date_local 
        ? (dateStr >= eventStartDate && dateStr <= eventEndDate)
        : (dateStr === eventStartDate);
      
      return isDateInRange;
    }).map(e => ({ ...e, isCompleted: false }));

    return [...dayActivities, ...dayEvents];
  }

  // For today and future dates, show both completed activities and planned events
  const dayEvents = events.filter(event => {
    if (!event.start_date_local) return false;
    
    const eventStartDate = event.start_date_local.substring(0, 10);
    let eventEndDate = eventStartDate;
    
    if (event.end_date_local) {
      eventEndDate = event.end_date_local.substring(0, 10);
      // If end_date_local has T00:00:00, subtract 1 day to get correct display range
      // because Intervals.icu interprets YYYY-MM-DDT00:00:00 as end of previous day
      if (event.end_date_local.endsWith('T00:00:00')) {
        const endDateObj = new Date(eventEndDate);
        endDateObj.setDate(endDateObj.getDate() - 1);
        eventEndDate = endDateObj.toISOString().split('T')[0];
      }
    }
    // Note: We don't try to infer multi-day events from duration anymore
    // because intervals.icu expands them into individual daily events
    
    // For events created by our app with date ranges, check if current date is within range
    // For events from intervals.icu, they will be individual daily events
    const isDateInRange = event.end_date_local 
      ? (dateStr >= eventStartDate && dateStr <= eventEndDate)
      : (dateStr === eventStartDate);
    
    if (!isDateInRange) return false;
    
    // Exclude if this event is already in pendingEvents (to avoid duplicates)
    const isPending = pendingEvents.some(pe =>
      pe.start_date_local?.substring(0, 10) === eventStartDate && pe.name === event.name
    );
    // Exclude if a completed activity with the same name exists (workout was completed)
    const isCompleted = dayActivities.some(activity => {
      const activityName = (activity.name || '').toLowerCase().trim();
      const eventName = (event.name || '').toLowerCase().trim();
      return activityName.includes(eventName);
    });
    return !isPending && !isCompleted;
  }).map(e => ({ ...e, isCompleted: false }));

  // Get pending events for this day
  const dayPendingEvents = pendingEvents.filter(event => {
    if (!event.start_date_local) return false;
    return event.start_date_local.substring(0, 10) === dateStr;
  }).map(e => ({ ...e, isCompleted: false, isPending: true }));

  // Return activities first (completed), then existing events, then pending events
  const result = [...dayActivities, ...dayEvents, ...dayPendingEvents];
  
  return result;
};

/**
 * Build a YYYY-MM-DD date string from year, month (0-indexed), day.
 */
export const buildDateStr = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
