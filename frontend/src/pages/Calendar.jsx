import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCalendar } from '../context/CalendarContext';
import { getDaysInMonth } from '../utils/calendarUtils';
import { fetchCalendarEvents, fetchAthleteProfile } from '../services/calendarService';
import api from '../api/axios';
import { useCalendarDragDrop } from '../hooks/useCalendarDragDrop';
import { useCalendarMobileNavigation } from '../hooks/useCalendarMobileNavigation';
import { useCalendarEventHandlers } from '../hooks/useCalendarEventHandlers';
import { useCalendarModalState } from '../hooks/useCalendarModalState';
import { useCalendarState } from '../hooks/useCalendarState';
import { useCalendarHandlers } from '../hooks/useCalendarHandlers';
import { getItemsForDate, buildDateStr } from '../utils/calendarDayItems';
import CalendarHeader from '../components/calendar/CalendarHeader';
import CalendarGrid from '../components/calendar/CalendarGrid';
import CalendarModals from '../components/calendar/CalendarModals';

const Calendar = () => {
  const { logout } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [hasStravaToken, setHasStravaToken] = useState(false);
  
  const { 
    calendarEvents, 
    calendarActivities, 
    fetchCalendarData,
    refreshCalendarData,
    isDateRangeCovered 
  } = useCalendar();
  
  // Check if user has Strava connection
  useEffect(() => {
    const checkStravaConnection = async () => {
      try {
        const response = await api.get('/user/me');
        setHasStravaToken((response.data.stravaEnabled && response.data.hasStravaToken) || false);
      } catch (err) {
        setHasStravaToken(false);
      }
    };
    checkStravaConnection();
  }, []);
  
  // Use calendar modal state hook
  const {
    selectedEvent,
    setSelectedEvent,
    activityDetails,
    setActivityDetails,
    detailsLoading,
    setDetailsLoading,
    athleteProfile,
    setAthleteProfile,
    isDeleting,
    showScheduler,
    setShowScheduler,
    schedulerData,
    setSchedulerData,
    loadingSchedulerData,
    setLoadingSchedulerData,
    pendingEvents,
    setPendingEvents,
    isCommitting,
    setIsCommitting,
    regeneratingDate,
    setRegeneratingDate,
    selectedCategoryPerDate,
    setSelectedCategoryPerDate,
    confirmDialog,
    setConfirmDialog,
    alertDialog,
    setAlertDialog,
    stravaData,
    setStravaData,
    stravaLoading,
    setStravaLoading
  } = useCalendarModalState();
  
  // Use consolidated calendar state hook
  const {
    events,
    setEvents,
    activities,
    setActivities,
    loading,
    setLoading,
    error,
    setError,
    showDeleteRange,
    setShowDeleteRange,
    deleteRange,
    setDeleteRange,
    isDeletingRange,
    setIsDeletingRange,
    showUpload,
    setShowUpload,
    showAddEntryType,
    setShowAddEntryType,
    showAddEntry,
    setShowAddEntry,
    selectedEntryType,
    setSelectedEntryType,
    selectedDate,
    setSelectedDate,
    showMoveWorkout,
    setShowMoveWorkout,
    workoutToMove,
    setWorkoutToMove
  } = useCalendarState(currentDate, calendarEvents, calendarActivities);

  // Use calendar drag and drop hook
  const {
    draggedEvent,
    dropTargetDay,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd
  } = useCalendarDragDrop(currentDate, setEvents, setPendingEvents, setAlertDialog, refreshCalendarData);

  // Use calendar mobile navigation hook
  const {
    isMobile,
    currentMobileDate,
    navigateMobileDay,
    getMobileDayItems
  } = useCalendarMobileNavigation(currentDate, activities, events, pendingEvents, setCurrentDate);

  // Use calendar event handlers hook
  const {
    handleEventClick,
    handleDeleteEvent,
    handleEventsCreated
  } = useCalendarEventHandlers(
    selectedEvent,
    setSelectedEvent,
    setActivityDetails,
    setDetailsLoading,
    () => {}, // setIsDeleting not needed anymore
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
  );
  
  // Use consolidated calendar handlers hook
  const {
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
  } = useCalendarHandlers({
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
  });

  // Initialize calendar on mount and when date changes
  useEffect(() => {
    const initializeCalendar = async () => {
      try {
        await fetchCalendarEvents(
          currentDate, 
          calendarEvents, 
          calendarActivities, 
          isDateRangeCovered, 
          fetchCalendarData, 
          setEvents, 
          setActivities, 
          setLoading, 
          setError
        );
      } catch (err) {
        console.error('Calendar initialization error:', err);
        setError('Failed to initialize calendar');
        setLoading(false);
      }
    };

    initializeCalendar();
  }, [currentDate]);

  // Fetch athlete profile for zones
  useEffect(() => {
    fetchAthleteProfile(setAthleteProfile);
  }, []);

  // Helper functions for getting items for specific days

  const getItemsForDay = (day) => {
    const dateStr = buildDateStr(currentDate.getFullYear(), currentDate.getMonth(), day);
    return getItemsForDate(dateStr, activities, events, pendingEvents);
  };

  const getItemsForAnyDay = (year, month, day) => {
    const dateStr = buildDateStr(year, month, day);
    return getItemsForDate(dateStr, activities, events, pendingEvents);
  };

  // Calendar display constants
  const { daysInMonth, adjustedStartingDay, prevMonthDays, prevMonthToShow, nextMonthToShow } = getDaysInMonth(currentDate);
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekDaysShort = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];

  // Add a loading state component to prevent blank page
  if (loading && calendarEvents.length === 0 && calendarActivities.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading calendar...</p>
        </div>
      </div>
    );
  }

  // Show error state if there's an error
  if (error && calendarEvents.length === 0 && calendarActivities.length === 0) {
    const isAuthError = error.includes('Access denied') || error.includes('Session expired') || error.includes('permissions');
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            {isAuthError && (
              <button 
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Login Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback: Always render the calendar, even with empty data
  // This prevents blank page on refresh
  const safeEvents = events || [];
  const safeActivities = activities || [];
  const safePendingEvents = pendingEvents || [];

  return (
    <div className="min-h-screen bg-gray-50">
    <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
      {/* Header */}
      <CalendarHeader
        currentDate={currentDate}
        monthNames={monthNames}
        pendingEvents={pendingEvents}
        loadingSchedulerData={loadingSchedulerData}
        isCommitting={isCommitting}
        onNavigateMonth={(direction, exactDate) => {
          if (exactDate) {
            setCurrentDate(exactDate);
          } else {
            setCurrentDate(navigateMonth(direction));
          }
        }}
        onOpenScheduler={handleOpenScheduler}
        onCommitSchedule={handleCommitScheduleLocal}
        onClearSchedule={() => setPendingEvents([])}
        onOpenDeleteRange={openDeleteRange}
      />

      {/* Calendar Grid */}
      <CalendarGrid
        currentDate={currentDate}
        weekDays={weekDays}
        weekDaysShort={weekDaysShort}
        monthNames={monthNames}
        events={safeEvents}
        activities={safeActivities}
        pendingEvents={safePendingEvents}
        loading={loading}
        error={error}
        draggedEvent={draggedEvent}
        dropTargetDay={dropTargetDay}
        regeneratingDate={regeneratingDate}
        selectedCategoryPerDate={selectedCategoryPerDate}
        daysInMonth={daysInMonth}
        adjustedStartingDay={adjustedStartingDay}
        prevMonthDays={prevMonthDays}
        prevMonthToShow={prevMonthToShow}
        nextMonthToShow={nextMonthToShow}
        sportSettings={athleteProfile?.sportSettings}
        onEventClick={handleEventClick}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onRegenerateWorkout={handleRegenerateWorkoutLocal}
        onCategoryChange={(dateStr, category) => setSelectedCategoryPerDate(prev => ({
          ...prev,
          [dateStr]: category
        }))}
        onMoveWorkout={(workout) => {
        setWorkoutToMove(workout);
        setShowMoveWorkout(true);
      }}
        getItemsForDay={getItemsForDay}
        getItemsForAnyDay={getItemsForAnyDay}
        getMobileDayItems={getMobileDayItems}
        isMobile={isMobile}
        currentMobileDate={currentMobileDate}
        navigateMobileDay={navigateMobileDay}
        onEmptyDayClick={handleEmptyDayClick}
      />

      {/* All Modals */}
      <CalendarModals
        selectedEvent={selectedEvent}
        setSelectedEvent={setSelectedEvent}
        activityDetails={activityDetails}
        setActivityDetails={setActivityDetails}
        detailsLoading={detailsLoading}
        setDetailsLoading={setDetailsLoading}
        stravaData={stravaData}
        setStravaData={setStravaData}
        stravaLoading={stravaLoading}
        setStravaLoading={setStravaLoading}
        athleteProfile={athleteProfile}
        isDeleting={isDeleting}
        handleDeleteEvent={handleDeleteEvent}
        setActivities={setActivities}
        currentDate={currentDate}
        refreshCalendarData={refreshCalendarData}
        pendingEvents={pendingEvents}
        showDeleteRange={showDeleteRange}
        setShowDeleteRange={setShowDeleteRange}
        deleteRange={deleteRange}
        setDeleteRange={setDeleteRange}
        isDeletingRange={isDeletingRange}
        handleDeleteRange={handleDeleteRange}
        showUpload={showUpload}
        setShowUpload={setShowUpload}
        showScheduler={showScheduler}
        setShowScheduler={setShowScheduler}
        schedulerData={schedulerData}
        setSchedulerData={setSchedulerData}
        handleEventsCreated={handleEventsCreated}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
        alertDialog={alertDialog}
        setAlertDialog={setAlertDialog}
        showMoveWorkout={showMoveWorkout}
        setShowMoveWorkout={setShowMoveWorkout}
        workoutToMove={workoutToMove}
        setWorkoutToMove={setWorkoutToMove}
        handleMoveWorkout={handleMoveWorkout}
        showAddEntryType={showAddEntryType}
        setShowAddEntryType={setShowAddEntryType}
        showAddEntry={showAddEntry}
        setShowAddEntry={setShowAddEntry}
        selectedEntryType={selectedEntryType}
        setSelectedEntryType={setSelectedEntryType}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        handleEntryTypeSelect={handleEntryTypeSelect}
        handleEntryCreated={handleEntryCreated}
      />

    </div>
    </div>
  );
};

export default Calendar;
