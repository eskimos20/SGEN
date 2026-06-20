import { useState, useCallback, useMemo } from 'react';

export const INTERVAL_TYPES = [
  { id: 'warmup', name: 'Warm Up', icon: '🔥', defaultPowerStart: 50, defaultPowerEnd: 75, defaultDuration: 600, isRamp: true },
  { id: 'steady', name: 'Steady', icon: '📊', defaultPower: 75, defaultDuration: 300 },
  { id: 'interval', name: 'Interval', icon: '⚡', defaultPower: 100, defaultDuration: 480, defaultReps: 4, defaultRestDuration: 120, defaultRestPower: 40 },
  { id: 'recovery', name: 'Recovery', icon: '💤', defaultPower: 40, defaultDuration: 180 },
  { id: 'ramp', name: 'Ramp', icon: '📈', defaultPowerStart: 50, defaultPowerEnd: 100, defaultDuration: 300, isRamp: true },
  { id: 'cooldown', name: 'Cool Down', icon: '❄️', defaultPowerStart: 60, defaultPowerEnd: 40, defaultDuration: 600, isRamp: true }
];

export const useWorkoutSteps = () => {
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
          if (i < step.reps - 1) {
            expanded.push({
              duration: step.restDuration,
              power: { value: step.restPower }
            });
          }
        }
        return expanded;
      } else if (intervalType?.isRamp) {
        return [{
          duration: step.duration,
          power: { start: step.powerStart, end: step.powerEnd }
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
      const newStep = {
        id: Date.now(),
        type: draggedType,
        ...(intervalType.isRamp ? {
          powerStart: intervalType.defaultPowerStart,
          powerEnd: intervalType.defaultPowerEnd,
          duration: intervalType.defaultDuration
        } : {
          power: intervalType.defaultPower,
          duration: intervalType.defaultDuration
        }),
        ...(draggedType === 'interval' && {
          reps: intervalType.defaultReps,
          restDuration: intervalType.defaultRestDuration,
          restPower: intervalType.defaultRestPower
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
  }, [draggedType, draggedStepIndex]);

  const handleDragEnd = useCallback(() => {
    setDraggedType(null);
    setDraggedStepIndex(null);
    setDropTargetIndex(null);
  }, []);

  // Remove interval
  const removeInterval = useCallback((id) => {
    setSteps(prev => prev.filter(step => step.id !== id));
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
    openEditModal,
    saveEditedStep
  };
};
