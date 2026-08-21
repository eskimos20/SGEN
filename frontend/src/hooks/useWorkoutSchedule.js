import { useState, useCallback, useEffect } from 'react';
import { getCalendarDisplayRange } from '../utils/calendarUtils';
import api from '../api/axios';

export const useWorkoutSchedule = (refreshCalendarData, getSportType) => {
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [ftp, setFtp] = useState(280);

  useEffect(() => {
    if (!showScheduleModal || !selectedWorkout) return;
    
    const fetchFtp = async () => {
      try {
        const response = await api.get('/statistics/athlete-profile');
        const sportSettings = response.data.sportSettings;
        
        if (sportSettings && Array.isArray(sportSettings)) {
          const workoutSportType = getSportType(selectedWorkout);
          const sportKey = workoutSportType === 'run' ? 'Run' : 'Ride';
          
          const sportSetting = sportSettings.find(setting => 
            setting.types && setting.types.some(type => type === sportKey)
          );
          
          if (sportSetting && sportSetting.ftp) {
            setFtp(sportSetting.ftp);
          } else {
            setFtp(sportKey === 'Run' ? 240 : 280);
          }
        }
      } catch (err) {
        console.error('Failed to fetch FTP:', err);
        const workoutSportType = getSportType(selectedWorkout);
        const sportKey = workoutSportType === 'run' ? 'Run' : 'Ride';
        setFtp(sportKey === 'Run' ? 240 : 280);
      }
    };
    
    fetchFtp();
  }, [showScheduleModal, selectedWorkout, getSportType]);

  const handleScheduleWorkout = useCallback(async () => {
    if (!selectedWorkout || !scheduleDate) {
      throw new Error('Please select a date to schedule the workout.');
    }
    
    let zwoContent = selectedWorkout.zwoContent || '';
    
    // If no zwoContent but we have zwoFilePath (from library cache), fetch the content
    if (!zwoContent && selectedWorkout.zwoFilePath) {
      try {
        const response = await api.get(`/statistics/workout-library/zwo?path=${encodeURIComponent(selectedWorkout.zwoFilePath)}`);
        zwoContent = response.data.content || '';
      } catch (err) {
        console.error('Failed to fetch ZWO content:', err);
        throw new Error('Could not load workout file. Please try again.');
      }
    }
    
    // For custom workouts with zwoFilePath but no content, fetch it
    if (!zwoContent && selectedWorkout.source === 'custom' && selectedWorkout.zwoFilePath) {
      try {
        const response = await api.get(`/statistics/custom-workouts/zwo?path=${encodeURIComponent(selectedWorkout.zwoFilePath)}`);
        zwoContent = response.data.content || '';
      } catch (err) {
        console.error('Failed to fetch ZWO content for custom workout:', err);
        throw new Error('Could not load custom workout file. Please try again.');
      }
    }
    
    const workoutDoc = selectedWorkout.workout_doc || { steps: [] };
    const workoutSportType = getSportType(selectedWorkout);
    const sportDisplayName = workoutSportType === 'run' ? 'Run' : 'Ride';
    const durationSeconds = (selectedWorkout.duration || 0) * 60;
    const workoutLoad = selectedWorkout.tss || 0;
    
    // Build workout name in same format as Scheduler: "Category TSS## shortDescription"
    const category = selectedWorkout.category || 'Workout';
    const tss = selectedWorkout.tss || 0;
    const shortDesc = selectedWorkout.shortDescription || '';
    const workoutName = shortDesc 
      ? `${category} TSS${tss} ${shortDesc}`
      : `${category} TSS${tss}`;
    
    const eventPayload = {
      start_date_local: `${scheduleDate}T00:00:00`,
      name: workoutName,
      description: selectedWorkout.description || '',
      shortDescription: shortDesc,
      type: sportDisplayName,
      category: 'WORKOUT',
      moving_time: durationSeconds,
      icu_training_load: workoutLoad,
      indoor: true,
      workout_doc: {
        ...workoutDoc,
        sport_type: workoutSportType
      },
      file_contents: zwoContent,
      filename: selectedWorkout.filename || `${selectedWorkout.name}.zwo`
    };
    
    await api.post('/statistics/calendar/events/batch', {
      events: [eventPayload]
    });
    
    const { oldest, newest } = getCalendarDisplayRange(new Date(scheduleDate));
    await refreshCalendarData(oldest, newest);
    
    setShowScheduleModal(false);
    setSelectedWorkout(null);
    setScheduleDate('');
    
    return selectedWorkout.name;
  }, [selectedWorkout, scheduleDate, getSportType, refreshCalendarData]);

  const openScheduleModal = useCallback((workout) => {
    setSelectedWorkout(workout);
    setScheduleDate(new Date().toISOString().split('T')[0]);
    setShowScheduleModal(true);
  }, []);

  const closeScheduleModal = useCallback(() => {
    setShowScheduleModal(false);
    setSelectedWorkout(null);
    setScheduleDate('');
  }, []);

  return {
    selectedWorkout,
    showScheduleModal,
    scheduleDate,
    setScheduleDate,
    ftp,
    handleScheduleWorkout,
    openScheduleModal,
    closeScheduleModal
  };
};
