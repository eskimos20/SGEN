import { useState, useCallback } from 'react';
import { getCalendarDisplayRange } from '../utils/calendarUtils';
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
  const [scheduleDate, setScheduleDate] = useState('');

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
          if (i < step.reps - 1) {
            const restPower = step.restPower / 100;
            xml += `    <SteadyState Duration="${step.restDuration}" Power="${restPower}" pace="0"/>\n`;
          }
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
    INTERVAL_TYPES
  ) => {
    if (saveAndSchedule && !scheduleDate) {
      throw new Error('Please select a date to schedule your workout.');
    }

    setIsSaving(true);
    try {
      const tss = Math.round(workoutMetrics.tss);
      const zwoContent = generateZwoContent(steps, selectedCategory, description, shortDescription, sportType, tss, INTERVAL_TYPES);
      
      // Create workout_doc for Intervals.icu
      const workoutDoc = { 
        steps: workoutSteps,
        sport_type: sportType === 'Run' ? 'run' : 'bike'
      };
      
      const durationSeconds = workoutMetrics.totalDuration;
      
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
        duration: durationSeconds
      });

      // Schedule if checkbox is checked
      if (saveAndSchedule) {
        const workoutLoad = tss;
        
        const eventPayload = {
          start_date_local: `${scheduleDate}T00:00:00`,
          name: workoutName,
          description: description,
          shortDescription: shortDescription || '',
          type: sportType,
          category: 'WORKOUT',
          moving_time: durationSeconds,
          icu_training_load: workoutLoad,
          indoor: true,
          workout_doc: workoutDoc,
          file_contents: zwoContent,
          filename: `${autoWorkoutName}.zwo`
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
  }, [saveAndSchedule, scheduleDate, generateZwoContent, refreshCalendarData]);

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
