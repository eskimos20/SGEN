import { useState, useCallback } from 'react';
import { getCalendarDisplayRange } from '../utils/calendarUtils';
import { convertStepsToPaceTargets } from '../utils/workoutUtils';
import api from '../api/axios';

// Escape XML special characters
const escapeXml = (unsafe) => {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

export const useWorkoutSave = (refreshCalendarData) => {
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveAndSchedule, setSaveAndSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Generate .zwo XML content
  const generateZwoContent = useCallback((steps, selectedCategory, description, shortDescription, sportType, tss, INTERVAL_TYPES) => {
    const finalName = escapeXml(`${selectedCategory} TSS ${tss}`);
    const safeDescription = escapeXml(description || 'Custom workout created with SGEN Workout Creator');
    const safeCategory = escapeXml(selectedCategory);
    const sportTypeXml = sportType === 'Run' ? 'run' : 'bike';
    const safeShortDesc = escapeXml(shortDescription || '');
    
    let xml = `<workout_file>\n`;
    xml += `  <author>Eskimos</author>\n`;
    xml += `  <name>${finalName}</name>\n`;
    xml += `  <description>${safeDescription}</description>\n`;
    xml += `  <sportType>${sportTypeXml}</sportType>\n`;
    xml += `  <tags>\n`;
    xml += `    <tag name="${safeCategory}"/>\n`;
    xml += `  </tags>\n`;
    if (safeShortDesc) {
      xml += `  <metadata version="1.0">\n`;
      xml += `    <shortDescription>${safeShortDesc}</shortDescription>\n`;
      xml += `  </metadata>\n`;
    }
    xml += `  <workout>\n`;
    
    steps.forEach(step => {
      const intervalType = INTERVAL_TYPES.find(t => t.id === step.type);
      
      if (step.type === 'interval' && step.reps > 1) {
        for (let i = 0; i < step.reps; i++) {
          const power = step.power / 100;
          xml += `    <SteadyState Duration="${step.duration}" Power="${power}" pace="0"/>\n`;
          const restPower = step.restPower / 100;
          xml += `    <SteadyState Duration="${step.restDuration}" Power="${restPower}" pace="0"/>\n`;
        }
      } else if (intervalType?.isRamp) {
        const powerStart = step.powerStart / 100;
        const powerEnd = step.powerEnd / 100;
        
        if (step.type === 'warmup') {
          xml += `    <Warmup Duration="${step.duration}" PowerLow="${powerStart}" PowerHigh="${powerEnd}" pace="0"/>\n`;
        } else if (step.type === 'cooldown') {
          xml += `    <Cooldown Duration="${step.duration}" PowerLow="${powerStart}" PowerHigh="${powerEnd}" pace="0"/>\n`;
        } else {
          xml += `    <Ramp Duration="${step.duration}" PowerLow="${powerStart}" PowerHigh="${powerEnd}" pace="0"/>\n`;
        }
      } else {
        const power = step.power / 100;
        xml += `    <SteadyState Duration="${step.duration}" Power="${power}" pace="0"/>\n`;
      }
    });
    
    xml += `  </workout>\n`;
    xml += `</workout_file>`;
    
    return xml;
  }, []);

  // Format seconds in Intervals.icu workout builder duration syntax
  const formatDurationForIntervals = useCallback((seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let res = '';
    if (h > 0) res += `${h}h`;
    if (m > 0) res += `${m}m`;
    if (s > 0) res += `${s}s`;
    return res || '0s';
  }, []);

  // Generate Intervals.icu workout builder plain-text description from steps.
  // This is the format Intervals.icu parses to create the structured workout.
  const generateIntervalsDescription = useCallback((steps, usePace, INTERVAL_TYPES) => {
    if (!steps || steps.length === 0) return '';
    const lines = [];
    let previousWasBlock = false;
    steps.forEach((step) => {
      const intervalType = INTERVAL_TYPES.find(t => t.id === step.type);
      const suffix = usePace ? ' Pace' : '';
      if (step.type === 'interval') {
        if (lines.length > 0) lines.push('');
        if (step.reps > 1) lines.push(`${step.reps}x`);
        lines.push(`- Go ${formatDurationForIntervals(step.duration)} ${step.power}%${suffix}`);
        lines.push(`- Rest ${formatDurationForIntervals(step.restDuration)} ${step.restPower}%${suffix}`);
        previousWasBlock = true;
      } else if (intervalType?.isRamp) {
        if (previousWasBlock) {
          lines.push('');
          previousWasBlock = false;
        }
        const cue = step.type === 'warmup' ? 'Warmup' : step.type === 'cooldown' ? 'Cooldown' : 'Ramp';
        lines.push(`- ${cue} ${formatDurationForIntervals(step.duration)} ramp ${step.powerStart}-${step.powerEnd}%${suffix}`);
      } else {
        if (previousWasBlock) {
          lines.push('');
          previousWasBlock = false;
        }
        const cue = step.type === 'recovery' ? 'Recovery'
          : step.type === 'steady' ? 'Steady'
          : step.type === 'warmup' ? 'Warmup'
          : step.type === 'cooldown' ? 'Cooldown'
          : 'Steady';
        lines.push(`- ${cue} ${formatDurationForIntervals(step.duration)} ${step.power}%${suffix}`);
      }
    });
    return lines.join('\n');
  }, [formatDurationForIntervals]);

  // Save workout (with optional schedule)
  const saveWorkout = useCallback(async (
    steps,
    workoutSteps,
    workoutMetrics,
    selectedCategory,
    description,
    shortDescription,
    sportType,
    autoWorkoutName,
    INTERVAL_TYPES,
    overwriteFilename,
    usePace = false,
    thresholdPace = null,
    paceUnits = null
  ) => {
    if (saveAndSchedule && !scheduleDate) {
      throw new Error('Please select a date to schedule your workout.');
    }

    setIsSaving(true);
    try {
      const tss = Math.round(workoutMetrics.tss);
      const zwoContent = generateZwoContent(steps, selectedCategory, description, shortDescription, sportType, tss, INTERVAL_TYPES);
      const isPaceWorkout = usePace && sportType === 'Run' && thresholdPace > 0;

      // Create workout_doc for Intervals.icu - use pace targets instead of %FTP power
      // targets when the workout was built in pace mode (required for correct Garmin/
      // Suunto pace zones on Run workouts; ZWO files cannot represent pace targets).
      const workoutDoc = {
        steps: isPaceWorkout ? convertStepsToPaceTargets(workoutSteps) : workoutSteps,
        sport_type: sportType === 'Run' ? 'run' : 'bike',
        ...(isPaceWorkout ? { target: 'PACE' } : {})
      };

      // Build Intervals.icu plain-text description for pace workouts.
      // Intervals.icu parses this 'description' to create the structured workout.
      const intervalsDescription = isPaceWorkout
        ? generateIntervalsDescription(steps, true, INTERVAL_TYPES)
        : description;
      const eventDescription = isPaceWorkout
        ? (description ? `# ${description}\n\n` : '') + intervalsDescription
        : description;

      const durationSeconds = workoutMetrics.totalDuration;
      const durationMinutes = Math.round(durationSeconds / 60);

      // Build workout name with shortDescription: "Category TSS## shortDescription"
      const workoutName = shortDescription
        ? `${selectedCategory} TSS${tss} ${shortDescription}`
        : `${selectedCategory} TSS${tss}`;

      // Save workout
      const response = await api.post('/statistics/custom-workouts', {
        category: selectedCategory,
        tss: tss,
        name: workoutName,
        description: description,
        shortDescription: shortDescription || '',
        zwoContent: zwoContent,
        workoutDoc: workoutDoc,
        duration: durationMinutes,
        ...(overwriteFilename ? { filename: overwriteFilename } : {})
      });

      // Schedule if checkbox is checked
      if (saveAndSchedule) {
        const workoutLoad = tss;
        
        const eventPayload = {
          start_date_local: `${scheduleDate}T00:00:00`,
          name: workoutName,
          description: eventDescription,
          shortDescription: shortDescription || '',
          type: sportType,
          category: 'WORKOUT',
          moving_time: durationSeconds,
          icu_training_load: workoutLoad,
          indoor: true,
          // For pace workouts the Intervals.icu builder parses the description text.
          // Sending a pre-built workout_doc object is ignored, so we omit it for Run/pace.
          ...(isPaceWorkout ? {} : { workout_doc: workoutDoc }),
          ...(isPaceWorkout ? { target: 'PACE' } : {}),
          // ZWO files can't represent pace targets - omit file_contents for pace
          // workouts so Intervals.icu doesn't fall back to the %FTP-based ZWO import.
          ...(isPaceWorkout ? {} : { file_contents: zwoContent, filename: `${autoWorkoutName}.zwo` })
        };
        
        await api.post('/statistics/calendar/events/batch', {
          events: [eventPayload]
        });
        
        const { oldest, newest } = getCalendarDisplayRange(new Date(scheduleDate));
        await refreshCalendarData(oldest, newest);
      }

      return {
        success: true,
        filename: response.data.filename,
        scheduled: saveAndSchedule
      };
    } catch (error) {
      console.error('Failed to save workout:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [saveAndSchedule, scheduleDate, generateZwoContent, generateIntervalsDescription, refreshCalendarData]);

  const resetSaveState = useCallback(() => {
    setShowSaveDialog(false);
    setSaveAndSchedule(false);
    setScheduleDate('');
  }, []);

  return {
    isSaving,
    showSaveDialog,
    setShowSaveDialog,
    saveAndSchedule,
    setSaveAndSchedule,
    scheduleDate,
    setScheduleDate,
    saveWorkout,
    resetSaveState
  };
};
