import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

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

const getTouchDropIndex = (clientX, clientY) => {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;

  const drop = el.closest('[data-drop-index]');
  if (drop) return Number(drop.dataset.dropIndex);

  const step = el.closest('[data-step-index]');
  if (step) {
    const rect = step.getBoundingClientRect();
    const idx = Number(step.dataset.stepIndex);
    return (clientX - rect.left) < rect.width / 2 ? idx : idx + 1;
  }

  return null;
};

export const useWorkoutSteps = (selectedCategory = 'Threshold', usePace = false, paceZones = null) => {
  const [steps, setSteps] = useState([]);
  const [draggedType, setDraggedType] = useState(null);
  const [draggedStepIndex, setDraggedStepIndex] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [editingStep, setEditingStep] = useState(null);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const touchSourceRef = useRef(null);

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
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }, []);

  // Handle drag start from existing step
  const handleStepDragStart = useCallback((e, index) => {
    setDraggedStepIndex(index);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Handle drag over drop zone
  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = draggedType ? 'copy' : 'move';
    setDropTargetIndex(index);
  }, [draggedType]);

  const buildNewStep = useCallback((typeId) => {
    const intervalType = INTERVAL_TYPES.find(t => t.id === typeId);
    const categoryDefaults = getCategoryIntervalDefaults(selectedCategory);
    const categoryPaceDefaults = usePace ? getCategoryPaceDefaults(selectedCategory, paceZones) : null;
    const paceRamp = usePace ? PACE_RAMP_DEFAULTS[typeId] : null;
    return {
      id: Date.now(),
      type: typeId,
      ...(intervalType.isRamp ? {
        powerStart: paceRamp ? paceRamp.start : intervalType.defaultPowerStart,
        powerEnd: paceRamp ? paceRamp.end : intervalType.defaultPowerEnd,
        duration: intervalType.defaultDuration
      } : {
        power: typeId === 'interval'
          ? (usePace ? categoryPaceDefaults.power : categoryDefaults.power)
          : (usePace ? getFixedPaceDefault(typeId, paceZones) : intervalType.defaultPower),
        duration: typeId === 'interval' ? categoryDefaults.duration : intervalType.defaultDuration
      }),
      ...(typeId === 'interval' && {
        reps: categoryDefaults.reps,
        restDuration: categoryDefaults.restDuration,
        restPower: usePace ? categoryPaceDefaults.restPower : categoryDefaults.restPower
      })
    };
  }, [selectedCategory, usePace, paceZones]);

  const addStepByType = useCallback((typeId) => {
    const newStep = buildNewStep(typeId);
    setSteps(prev => [...prev, newStep]);
  }, [buildNewStep]);

  // Handle drop
  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    
    if (draggedType) {
      const newStep = buildNewStep(draggedType);
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
  }, [draggedType, draggedStepIndex, buildNewStep]);

  const handleDragEnd = useCallback(() => {
    setDraggedType(null);
    setDraggedStepIndex(null);
    setDropTargetIndex(null);
  }, []);

  // Keep latest callback references for touch event listeners
  const handleDragOverRef = useRef(handleDragOver);
  const handleDropRef = useRef(handleDrop);
  const handleDragEndRef = useRef(handleDragEnd);
  const dropTargetIndexRef = useRef(dropTargetIndex);

  useEffect(() => { handleDragOverRef.current = handleDragOver; }, [handleDragOver]);
  useEffect(() => { handleDropRef.current = handleDrop; }, [handleDrop]);
  useEffect(() => { handleDragEndRef.current = handleDragEnd; }, [handleDragEnd]);
  useEffect(() => { dropTargetIndexRef.current = dropTargetIndex; }, [dropTargetIndex]);

  // Mobile touch drag handlers
  const startTouchDrag = useCallback((e, typeId, stepIndex) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeId) {
      setDraggedType(typeId);
      setDraggedStepIndex(null);
    } else if (stepIndex !== null) {
      setDraggedStepIndex(stepIndex);
      setDraggedType(null);
    }
    setIsTouchDragging(true);

    const card = e.currentTarget.closest('[data-drag-source]');
    if (card) {
      touchSourceRef.current = card;
      card.dataset.dragOriginalPointerEvents = card.style.pointerEvents || '';
      card.style.pointerEvents = 'none';
      card.style.opacity = '0.5';
      card.style.transform = 'scale(0.95)';
    }

    const restore = () => {
      if (touchSourceRef.current) {
        touchSourceRef.current.style.pointerEvents = touchSourceRef.current.dataset.dragOriginalPointerEvents || '';
        touchSourceRef.current.style.opacity = '';
        touchSourceRef.current.style.transform = '';
        touchSourceRef.current = null;
      }
    };

    const touchMove = (ev) => {
      const touch = ev.touches[0] || ev.changedTouches[0];
      if (!touch) return;
      ev.preventDefault();
      const dropIndex = getTouchDropIndex(touch.clientX, touch.clientY);
      if (dropIndex !== null) {
        handleDragOverRef.current(ev, dropIndex);
      }
    };

    const touchEnd = (ev) => {
      ev.preventDefault();
      if (dropTargetIndexRef.current !== null) {
        handleDropRef.current(ev, dropTargetIndexRef.current);
      } else {
        handleDragEndRef.current();
      }
      setIsTouchDragging(false);
      document.removeEventListener('touchmove', touchMove, { passive: false });
      document.removeEventListener('touchend', touchEnd);
      document.removeEventListener('touchcancel', touchEnd);
      restore();
    };

    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', touchEnd);
    document.addEventListener('touchcancel', touchEnd);
  }, [getTouchDropIndex]);

  const handlePaletteTouchStart = useCallback((e, typeId) => {
    startTouchDrag(e, typeId, null);
  }, [startTouchDrag]);

  const handleStepTouchStart = useCallback((e, index) => {
    startTouchDrag(e, null, index);
  }, [startTouchDrag]);

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
    handlePaletteTouchStart,
    handleStepTouchStart,
    addStepByType,
    removeInterval,
    copyStep,
    openEditModal,
    saveEditedStep
  };
};
