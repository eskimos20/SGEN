import { useState, useCallback, useMemo } from 'react';

export const INTERVAL_TYPES = [
  { id: 'warmup', name: 'Warm Up', icon: '🔥', defaultPowerStart: 50, defaultPowerEnd: 60, defaultDuration: 600, isRamp: true },
  { id: 'steady', name: 'Steady', icon: '📊', defaultPower: 65, defaultDuration: 300 },
  { id: 'interval', name: 'Interval', icon: '⚡', defaultPower: 100, defaultDuration: 480, defaultReps: 4, defaultRestDuration: 120, defaultRestPower: 40 },
  { id: 'recovery', name: 'Recovery', icon: '💤', defaultPower: 40, defaultDuration: 180 },
  { id: 'ramp', name: 'Ramp', icon: '📈', defaultPowerStart: 50, defaultPowerEnd: 100, defaultDuration: 300, isRamp: true },
  { id: 'cooldown', name: 'Cool Down', icon: '❄️', defaultPowerStart: 60, defaultPowerEnd: 50, defaultDuration: 600, isRamp: true }
];

const CATEGORY_INTERVAL_DEFAULTS = {
  Endurance: { power: 70, restPower: 40, duration: 900, reps: 3, restDuration: 120 },
  Tempo: { power: 85, restPower: 50, duration: 720, reps: 3, restDuration: 120 },
  SweetSpot: { power: 92, restPower: 55, duration: 600, reps: 3, restDuration: 120 },
  Threshold: { power: 100, restPower: 60, duration: 600, reps: 4, restDuration: 120 },
  VO2Max: { power: 115, restPower: 60, duration: 240, reps: 5, restDuration: 180 },
  Anaerobic: { power: 135, restPower: 65, duration: 60, reps: 6, restDuration: 300 },
  Sprint: { power: 160, restPower: 70, duration: 30, reps: 6, restDuration: 360 }
};

const getCategoryIntervalDefaults = (category) => {
  return CATEGORY_INTERVAL_DEFAULTS[category] || CATEGORY_INTERVAL_DEFAULTS.Threshold;
};

// Maps a workout category onto the equivalent pace zone index (0-based, Z1=0...Z7=6)
// e.g. Threshold -> Z4 (index 3), matching the same naming used for HR/Power zones.
const CATEGORY_PACE_ZONE_INDEX = {
  Endurance: 1,   // Z2
  Tempo: 2,       // Z3
  SweetSpot: 2.5, // between Z3 and Z4 (no dedicated zone)
  Threshold: 3,   // Z4
  VO2Max: 4,      // Z5
  Anaerobic: 5,   // Z6
  Sprint: 6       // Z7
};

// Get the % of threshold pace for a given (possibly fractional) zone index.
// paceZones are ascending upper-bound percentages from Intervals.icu sport settings.
const getPaceZoneValue = (paceZones, zoneIndex) => {
  if (!paceZones || paceZones.length === 0) return 100;
  if (Number.isInteger(zoneIndex)) {
    const value = paceZones[zoneIndex];
    if (value !== undefined && value < 999) return value;
    // Top zone is uncapped (999) - use previous zone boosted by 15% as a sane default
    const prev = paceZones[zoneIndex - 1] || 100;
    return Math.round(prev * 1.15);
  }
  const lower = paceZones[Math.floor(zoneIndex)] ?? 100;
  const upper = paceZones[Math.ceil(zoneIndex)] ?? lower;
  return Math.round((lower + upper) / 2);
};

const getCategoryPaceDefaults = (category, paceZones) => {
  const zoneIndex = CATEGORY_PACE_ZONE_INDEX[category] ?? CATEGORY_PACE_ZONE_INDEX.Threshold;
  const powerDefaults = getCategoryIntervalDefaults(category);
  return {
    power: getPaceZoneValue(paceZones, zoneIndex),
    restPower: getPaceZoneValue(paceZones, 0), // recovery between reps = Z1
    duration: powerDefaults.duration,
    reps: powerDefaults.reps,
    restDuration: powerDefaults.restDuration
  };
};

// Fixed pace defaults for non-category-based interval types (% of threshold pace)
const PACE_RAMP_DEFAULTS = {
  warmup: { start: 40, end: 60 },
  cooldown: { start: 60, end: 40 },
  ramp: { start: 50, end: 85 }
};

const getFixedPaceDefault = (typeId, paceZones) => {
  switch (typeId) {
    case 'steady': return getPaceZoneValue(paceZones, 1);   // Z2
    case 'recovery': return getPaceZoneValue(paceZones, 0); // Z1
    default: return 75;
  }
};

export const useWorkoutSteps = (selectedCategory = 'Threshold', usePace = false, paceZones = null) => {
  const [steps, setSteps] = useState([]);
  const [draggedType, setDraggedType] = useState(null);
  const [draggedStepIndex, setDraggedStepIndex] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [editingStep, setEditingStep] = useState(null);

  // Convert steps to workout format for chart and TSS calculation
  const workoutSteps = useMemo(() => {
    return steps.flatMap(step => {
      const intervalType = INTERVAL_TYPES.find(t => t.id === step.type);
      
      if (step.type === 'interval' && step.reps > 1) {
        const expanded = [];
        for (let i = 0; i < step.reps; i++) {
          expanded.push({
            duration: step.duration,
            power: { value: step.power }
          });
          expanded.push({
            duration: step.restDuration,
            power: { value: step.restPower }
          });
        }
        return expanded;
      } else if (intervalType?.isRamp) {
        return [{
          duration: step.duration,
          ramp: true,
          power: { start: step.powerStart, end: step.powerEnd },
          // Intervals.icu flag: step ends on lap button press (Garmin/Suunto only).
          // Zwift is unaffected - it reads the plain timed warmup from the .zwo file.
          ...(step.type === 'warmup' && { until_lap_press: true })
        }];
      } else {
        return [{
          duration: step.duration,
          power: { value: step.power }
        }];
      }
    });
  }, [steps]);

  // Handle drag start from interval palette
  const handlePaletteDragStart = useCallback((e, typeId) => {
    setDraggedType(typeId);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  // Handle drag start from existing step
  const handleStepDragStart = useCallback((e, index) => {
    setDraggedStepIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Handle drag over drop zone
  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedType ? 'copy' : 'move';
    setDropTargetIndex(index);
  }, [draggedType]);

  // Handle drop
  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    
    if (draggedType) {
      // Adding new interval from palette
      const intervalType = INTERVAL_TYPES.find(t => t.id === draggedType);
      const categoryDefaults = getCategoryIntervalDefaults(selectedCategory);
      const categoryPaceDefaults = usePace ? getCategoryPaceDefaults(selectedCategory, paceZones) : null;
      const paceRamp = usePace ? PACE_RAMP_DEFAULTS[draggedType] : null;
      const newStep = {
        id: Date.now(),
        type: draggedType,
        ...(intervalType.isRamp ? {
          powerStart: paceRamp ? paceRamp.start : intervalType.defaultPowerStart,
          powerEnd: paceRamp ? paceRamp.end : intervalType.defaultPowerEnd,
          duration: intervalType.defaultDuration
        } : {
          power: draggedType === 'interval'
            ? (usePace ? categoryPaceDefaults.power : categoryDefaults.power)
            : (usePace ? getFixedPaceDefault(draggedType, paceZones) : intervalType.defaultPower),
          duration: draggedType === 'interval' ? categoryDefaults.duration : intervalType.defaultDuration
        }),
        ...(draggedType === 'interval' && {
          reps: categoryDefaults.reps,
          restDuration: categoryDefaults.restDuration,
          restPower: usePace ? categoryPaceDefaults.restPower : categoryDefaults.restPower
        })
      };
      
      setSteps(prev => {
        const newSteps = [...prev];
        newSteps.splice(dropIndex, 0, newStep);
        return newSteps;
      });
    } else if (draggedStepIndex !== null) {
      // Reordering existing step
      setSteps(prev => {
        const newSteps = [...prev];
        const [movedStep] = newSteps.splice(draggedStepIndex, 1);
        const adjustedDropIndex = draggedStepIndex < dropIndex ? dropIndex - 1 : dropIndex;
        newSteps.splice(adjustedDropIndex, 0, movedStep);
        return newSteps;
      });
    }
    
    setDraggedType(null);
    setDraggedStepIndex(null);
    setDropTargetIndex(null);
  }, [draggedType, draggedStepIndex, selectedCategory, usePace, paceZones]);

  const handleDragEnd = useCallback(() => {
    setDraggedType(null);
    setDraggedStepIndex(null);
    setDropTargetIndex(null);
  }, []);

  // Remove interval
  const removeInterval = useCallback((id) => {
    setSteps(prev => prev.filter(step => step.id !== id));
  }, []);

  // Copy interval to the end
  const copyStep = useCallback((step) => {
    setSteps(prev => [...prev, { ...step, id: Date.now() }]);
  }, []);

  // Open edit modal
  const openEditModal = useCallback((step) => {
    setEditingStep({ ...step });
  }, []);

  // Save edited step
  const saveEditedStep = useCallback(() => {
    if (!editingStep) return;
    
    setSteps(prev => prev.map(step => 
      step.id === editingStep.id ? editingStep : step
    ));
    setEditingStep(null);
  }, [editingStep]);

  return {
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
  };
};
