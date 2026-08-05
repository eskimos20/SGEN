import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { calculateWorkoutMetrics, buildShortDescription, parseWorkoutDocToSteps } from '../utils/workoutUtils';
import api from '../api/axios';

const WorkoutCreator = () => {
  useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshCalendarData } = useCalendar();
  const [editingWorkout] = useState(() => location.state?.workout);

  const [selectedCategory, setSelectedCategory] = useState(editingWorkout?.category || 'Threshold');
  const [sportType, setSportType] = useState(editingWorkout?.sportType === 'run' ? 'Run' : 'Ride');
  const [description, setDescription] = useState(editingWorkout?.description || '');
  const [shortDescription, setShortDescription] = useState('');
  const [editingFilename, setEditingFilename] = useState(editingWorkout?.source === 'custom' ? editingWorkout.filename : null);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [ftp, setFtp] = useState(280);
  const [ftpMissing, setFtpMissing] = useState(false);
  const [usePace, setUsePace] = useState(() => editingWorkout?.workout_doc?.steps?.some(s => s.pace) || false);
  const [thresholdPace, setThresholdPace] = useState(null);
  const [paceZones, setPaceZones] = useState(null);
  const [paceUnits, setPaceUnits] = useState(null);
  const [paceSettingsLoading, setPaceSettingsLoading] = useState(true);

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
    copyStep,
    openEditModal,
    saveEditedStep
  } = useWorkoutSteps(selectedCategory, usePace && sportType === 'Run', paceZones);

  // Auto-generate short description from visible steps (skip warmup/cooldown)
  useEffect(() => {
    setShortDescription(buildShortDescription(steps));
  }, [steps, setShortDescription]);

  // Populate steps when editing an existing workout.
  useEffect(() => {
    if (editingWorkout?.workout_doc) {
      setSteps(parseWorkoutDocToSteps(editingWorkout.workout_doc));
    }
  }, [editingWorkout, setSteps]);

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
  
  // Fetch FTP (and pace zones for Run) based on sport type
  useEffect(() => {
    const fetchSportSettings = async () => {
      setPaceSettingsLoading(true);
      try {
        const response = await api.get('/statistics/athlete-profile');
        const sportSettings = response.data.sportSettings;
        
        if (sportSettings && Array.isArray(sportSettings)) {
          const sportKey = sportType === 'Run' ? 'Run' : 'Ride';
          const sportSetting = sportSettings.find(setting => 
            setting.types && setting.types.some(type => type === sportKey)
          );
          
          if (sportSetting && sportSetting.ftp > 0) {
            setFtp(sportSetting.ftp);
            setFtpMissing(false);
          } else {
            setFtp(sportType === 'Run' ? 240 : 275);
            setFtpMissing(true);
          }

          if (sportType === 'Run' && sportSetting?.threshold_pace > 0) {
            setThresholdPace(sportSetting.threshold_pace);
            setPaceZones(sportSetting.pace_zones || null);
            setPaceUnits(sportSetting.pace_units || null);
          } else {
            setThresholdPace(null);
            setPaceZones(null);
            setPaceUnits(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch FTP:', err);
        setFtp(sportType === 'Run' ? 240 : 275);
        setFtpMissing(true);
      } finally {
        setPaceSettingsLoading(false);
      }
    };
    
    fetchSportSettings();
  }, [sportType]);

  // Calculate workout metrics
  const workoutMetrics = useMemo(() => {
    const metrics = calculateWorkoutMetrics({ steps: workoutSteps }, ftp);
    if (!metrics) {
      return { tss: 0, duration: 0, totalDuration: 0, moving_time: 0 };
    }
    
    return {
      ...metrics,
      duration: metrics.moving_time,
      totalDuration: metrics.moving_time
    };
  }, [workoutSteps, ftp]);

  // Auto-generate workout name
  const autoWorkoutName = useMemo(() => {
    const tss = Math.round(workoutMetrics.tss);
    return `${selectedCategory} TSS ${tss}`;
  }, [selectedCategory, workoutMetrics.tss]);

  const paceLoadedAvailable = !paceSettingsLoading && thresholdPace > 0 && !!paceZones;
  const builderLocked = paceSettingsLoading || (sportType === 'Run'
    ? (usePace ? !paceLoadedAvailable : ftpMissing)
    : ftpMissing);
  const saveDisabled = builderLocked;

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
    if (usePace && sportType === 'Run' && !(thresholdPace > 0)) {
      setConfirmDialog({
        isOpen: true,
        title: 'Threshold Pace Required',
        message: 'You need to set a Run Threshold Pace in Statistics → Sport Settings before you can create pace-based workouts.',
        confirmText: 'OK',
        confirmStyle: 'danger',
        onConfirm: () => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }),
        onCancel: null
      });
      return;
    }
    setShowSaveDialog(true);
  }, [steps, usePace, sportType, thresholdPace]);

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
        INTERVAL_TYPES,
        editingFilename,
        usePace && sportType === 'Run',
        thresholdPace,
        paceUnits
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
  }, [steps, workoutSteps, workoutMetrics, selectedCategory, description, shortDescription, sportType, autoWorkoutName, saveAndSchedule, scheduleDate, saveWorkout, resetSaveState, setSteps, usePace, thresholdPace, paceUnits]);

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
          usePace={usePace}
          setUsePace={setUsePace}
          paceAvailable={paceSettingsLoading || !!(thresholdPace > 0 && paceZones)}
          saveDisabled={saveDisabled}
          ftpMissing={ftpMissing}
        />

        {/* Drag Items Palette */}
        <DragItemsPalette
          onDragStart={handlePaletteDragStart}
          onDragEnd={handleDragEnd}
          formatDuration={formatDuration}
          disabled={builderLocked}
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
          onCopyStep={copyStep}
          formatDuration={formatDuration}
          usePace={usePace && sportType === 'Run'}
          thresholdPace={thresholdPace}
          paceUnits={paceUnits}
          disabled={builderLocked}
        />
      </div>

      {/* Step Editor Modal */}
      <StepEditorModal
        editingStep={editingStep}
        setEditingStep={setEditingStep}
        onSave={saveEditedStep}
        onCancel={() => setEditingStep(null)}
        ftp={ftp}
        usePace={usePace && sportType === 'Run'}
        thresholdPace={thresholdPace}
        paceUnits={paceUnits}
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
