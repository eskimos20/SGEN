import { useState } from 'react';

// Custom hook for calendar modal state management
export const useCalendarModalState = () => {
  // Event and activity modals
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activityDetails, setActivityDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Strava data for activity (photos and segments)
  const [stravaData, setStravaData] = useState(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  
  // Scheduler modal
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedulerData, setSchedulerData] = useState(null);
  const [loadingSchedulerData, setLoadingSchedulerData] = useState(false);
  
  // Pending events management
  const [pendingEvents, setPendingEvents] = useState([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [regeneratingDate, setRegeneratingDate] = useState(null);
  const [selectedCategoryPerDate, setSelectedCategoryPerDate] = useState({});
  
  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState({ show: false, title: '', message: '', onConfirm: null });
  const [alertDialog, setAlertDialog] = useState({ show: false, title: '', message: '' });
  
  // RPE/Feel modal
  const [showRpeFeel, setShowRpeFeel] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  
  // Mobile navigation
  const [mobileSelectedDate, setMobileSelectedDate] = useState(null);

  return {
    // Event and activity states
    selectedEvent,
    setSelectedEvent,
    activityDetails,
    setActivityDetails,
    detailsLoading,
    setDetailsLoading,
    athleteProfile,
    setAthleteProfile,
    isDeleting,
    setIsDeleting,
    
    // Strava data states
    stravaData,
    setStravaData,
    stravaLoading,
    setStravaLoading,
    
    // Scheduler states
    showScheduler,
    setShowScheduler,
    schedulerData,
    setSchedulerData,
    loadingSchedulerData,
    setLoadingSchedulerData,
    
    // Pending events states
    pendingEvents,
    setPendingEvents,
    isCommitting,
    setIsCommitting,
    regeneratingDate,
    setRegeneratingDate,
    selectedCategoryPerDate,
    setSelectedCategoryPerDate,
    
    // Dialog states
    confirmDialog,
    setConfirmDialog,
    alertDialog,
    setAlertDialog,
    
    // RPE/Feel states
    showRpeFeel,
    setShowRpeFeel,
    selectedActivity,
    setSelectedActivity,
    
    // Mobile state
    mobileSelectedDate,
    setMobileSelectedDate
  };
};
