import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCalendar } from '../context/CalendarContext';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import WorkoutHeader from '../components/workout/WorkoutHeader';
import DragItemsPalette from '../components/workout/DragItemsPalette';
import WorkoutBuilder from '../components/workout/WorkoutBuilder';
import StepEditorModal from '../components/workout/StepEditorModal';
import SaveWorkoutDialog from '../components/workout/SaveWorkoutDialog';
import { useWorkoutSteps, INTERVAL_TYPES } from '../hooks/useWorkoutSteps';
import { useWorkoutSave } from '../hooks/useWorkoutSave';
import { calculateWorkoutMetrics } from '../utils/workoutUtils';
import api from '../api/axios';

const WorkoutCreator = () => {
  useAuth();
  const navigate = useNavigate();
  const { refreshCalendarData } = useCalendar();
  
  const [selectedCategory, setSelectedCategory] = useState('Threshold');
  const [sportType, setSportType] = useState('Ride');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [ftp, setFtp] = useState(280);
  
  // Workout steps management
  const {
    steps,
    setSteps,
    workoutSteps,
    draggedType,
    draggedStepIndex,
    dropTargetIndex,
    editingStep,
    setEditingStep,
    handlePaletteDragStart,
    handleStepDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    removeInterval,
    openEditModal,
    saveEditedStep
  } = useWorkoutSteps();

  // Workout save management
  const {
    isSaving,
    showSaveDialog,
    setShowSaveDialog,
    saveAndSchedule,
    setSaveAndSchedule,
    scheduleDate,
    setScheduleDate,
    saveWorkout,
    resetSaveState
  } = useWorkoutSave(refreshCalendarData);
  
  // Fetch FTP based on sport type
  useEffect(() => {
    const fetchFtp = async () => {
      try {
        const response = await api.get('/statistics/athlete-profile');
        const sportSettings = response.data.sportSettings;
        
        if (sportSettings && Array.isArray(sportSettings)) {
          const sportKey = sportType === 'Run' ? 'Run' : 'Ride';
          const sportSetting = sportSettings.find(setting => 
            setting.types && setting.types.some(type => type === sportKey)
          );
          
          if (sportSetting && sportSetting.ftp) {
            setFtp(sportSetting.ftp);
          } else {
            setFtp(sportType === 'Run' ? 240 : 275);
          }
        }
      } catch (err) {
        console.error('Failed to fetch FTP:', err);
        setFtp(sportType === 'Run' ? 240 : 275);
      }
    };
    
    fetchFtp();
  }, [sportType]);

  // Calculate workout metrics
  const workoutMetrics = useMemo(() => {
    const metrics = calculateWorkoutMetrics({ steps: workoutSteps }, ftp);
    if (!metrics) {
      return { tss: 0, duration: 0, totalDuration: 0, moving_time: 0 };
    }
    
    // Calculate TSS from intensity and duration
    // TSS = (duration_hours * intensity^2 * 100)
    const durationHours = metrics.moving_time / 3600;
    const tss = durationHours * Math.pow(metrics.icu_intensity, 2) * 100;
    
    return {
      ...metrics,
      tss,
      duration: metrics.moving_time,
      totalDuration: metrics.moving_time
    };
  }, [workoutSteps, ftp]);

  // Auto-generate workout name
  const autoWorkoutName = useMemo(() => {
    const tss = Math.round(workoutMetrics.tss);
    return `${selectedCategory} TSS ${tss}`;
  }, [selectedCategory, workoutMetrics.tss]);

  // Open save dialog
  const handleSave = useCallback(() => {
    if (steps.length === 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'No Intervals',
        message: 'Please add at least one interval to your workout before saving.',
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }),
        onCancel: null
      });
      return;
    }
    setShowSaveDialog(true);
  }, [steps]);

  // Confirm save
  const handleConfirmSave = useCallback(async () => {
    if (saveAndSchedule && !scheduleDate) {
      setConfirmDialog({
        isOpen: true,
        title: 'Date Required',
        message: 'Please select a date to schedule your workout.',
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }),
        onCancel: null
      });
      return;
    }

    try {
      const result = await saveWorkout(
        steps,
        workoutSteps,
        workoutMetrics,
        selectedCategory,
        description,
        shortDescription,
        sportType,
        autoWorkoutName,
        INTERVAL_TYPES
      );

      setConfirmDialog({
        isOpen: true,
        title: 'Success',
        message: result.scheduled 
          ? `Workout saved as ${result.filename} and scheduled successfully!`
          : `Workout saved successfully as ${result.filename}`,
        confirmText: 'OK',
        onConfirm: () => {
          setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null });
          resetSaveState();
          setSteps([]);
          setDescription('');
          setShortDescription('');
        },
        onCancel: null
      });
    } catch (error) {
      setConfirmDialog({
        isOpen: true,
        title: 'Save Failed',
        message: error.message || 'Failed to save workout. Please try again.',
        confirmText: 'OK',
        confirmStyle: 'danger',
        onConfirm: () => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }),
        onCancel: null
      });
    }
  }, [steps, workoutSteps, workoutMetrics, selectedCategory, description, sportType, autoWorkoutName, saveAndSchedule, scheduleDate, saveWorkout, resetSaveState, setSteps]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <WorkoutHeader
          autoWorkoutName={autoWorkoutName}
          sportType={sportType}
          setSportType={setSportType}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          description={description}
          setDescription={setDescription}
          shortDescription={shortDescription}
          setShortDescription={setShortDescription}
          workoutMetrics={workoutMetrics}
          onSave={handleSave}
          isSaving={isSaving}
          hasSteps={steps.length > 0}
        />

        {/* Drag Items Palette */}
        <DragItemsPalette
          onDragStart={handlePaletteDragStart}
          onDragEnd={handleDragEnd}
          formatDuration={formatDuration}
        />

        {/* Workout Builder */}
        <WorkoutBuilder
          steps={steps}
          workoutSteps={workoutSteps}
          workoutMetrics={workoutMetrics}
          ftp={ftp}
          draggedType={draggedType}
          draggedStepIndex={draggedStepIndex}
          dropTargetIndex={dropTargetIndex}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onStepDragStart={handleStepDragStart}
          onEditStep={openEditModal}
          onRemoveStep={removeInterval}
          formatDuration={formatDuration}
        />
      </div>

      {/* Step Editor Modal */}
      <StepEditorModal
        editingStep={editingStep}
        setEditingStep={setEditingStep}
        onSave={saveEditedStep}
        onCancel={() => setEditingStep(null)}
        ftp={ftp}
      />

      {/* Save Dialog */}
      <SaveWorkoutDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleConfirmSave}
        isSaving={isSaving}
        saveAndSchedule={saveAndSchedule}
        setSaveAndSchedule={setSaveAndSchedule}
        scheduleDate={scheduleDate}
        setScheduleDate={setScheduleDate}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        confirmStyle={confirmDialog.confirmStyle}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
      />
    </div>
  );
};

export default WorkoutCreator;
