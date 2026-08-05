import React from 'react';
import WorkoutChart from './WorkoutChart';
import WorkoutStepCard from './WorkoutStepCard';

const WorkoutBuilder = ({
  steps,
  workoutSteps,
  workoutMetrics,
  ftp,
  draggedType,
  draggedStepIndex,
  dropTargetIndex,
  onDragOver,
  onDrop,
  onStepDragStart,
  onStepTouchStart,
  onEditStep,
  onRemoveStep,
  onCopyStep,
  formatDuration,
  usePace = false,
  thresholdPace = null,
  paceUnits = null,
  disabled = false
}) => {
  if (steps.length === 0) {
    return (
      <div data-drop-index="0" className={`bg-white rounded-xl shadow-sm p-6 ${disabled ? 'opacity-60' : ''}`}>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Workout Builder (0 intervals)
        </h2>
        <div
          onDragOver={disabled ? undefined : (e) => onDragOver(e, 0)}
          onDrop={disabled ? undefined : (e) => onDrop(e, 0)}
          data-drop-index="0"
          className="h-80 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg bg-gray-50"
        >
          <p className="text-gray-500 text-lg font-medium">Drop intervals here to start building</p>
          <p className="text-gray-400 text-sm mt-2">Drag from the interval palette on the left</p>
        </div>
      </div>
    );
  }

  return (
    <div data-drop-index={steps.length} className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Workout Builder ({steps.length} intervals)
        </h2>
        <div className="text-sm text-gray-600">
          Total: {Math.round(workoutMetrics.duration / 60)} min
        </div>
      </div>
      
      <div className="relative">
        {/* Workout Chart Preview */}
        <div 
          data-drop-index={steps.length}
          className={`mb-4 md:mb-16 h-32 bg-gray-50 rounded-lg relative ${disabled ? 'opacity-60' : ''}`}
          onDragOver={disabled ? undefined : (e) => {
            if (draggedType || draggedStepIndex !== null) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onDrop={disabled ? undefined : (e) => {
            e.preventDefault();
            e.stopPropagation();
            onDrop(e, steps.length);
          }}
        >
          <WorkoutChart 
            workoutDoc={{ steps: workoutSteps }} 
            height="h-32"
            ftp={ftp}
            showTooltip={true}
            usePace={usePace}
            thresholdPace={thresholdPace}
            paceUnits={paceUnits}
          />
          {/* Drop overlay */}
          {(draggedType || draggedStepIndex !== null) && (
            <div className="absolute inset-0 bg-blue-500/10 border-2 border-blue-500 border-dashed rounded-lg flex items-center justify-center pointer-events-none">
              <p className="text-blue-600 font-semibold">Drop to add at end</p>
            </div>
          )}
        </div>

        {/* Interval Cards */}
        <div className="md:overflow-x-auto md:pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:gap-3 md:min-w-min">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                {/* Drop indicator before this card */}
                {dropTargetIndex === index && (
                  <div className="h-1 w-full bg-blue-500 rounded-full my-2 md:h-auto md:w-1 md:my-0 md:flex-shrink-0" />
                )}
                
                <WorkoutStepCard
                  step={step}
                  index={index}
                  isDragging={draggedStepIndex === index}
                  onDragStart={onStepDragStart}
                  onTouchStart={onStepTouchStart}
                  onEdit={onEditStep}
                  onRemove={onRemoveStep}
                  onCopy={onCopyStep}
                  formatDuration={formatDuration}
                  usePace={usePace}
                  thresholdPace={thresholdPace}
                  paceUnits={paceUnits}
                  disabled={disabled}
                />
              </React.Fragment>
            ))}
            
            {/* Drop indicator at end */}
            {dropTargetIndex === steps.length && (
              <div className="h-1 w-full bg-blue-500 rounded-full my-2 md:h-auto md:w-1 md:my-0 md:flex-shrink-0" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkoutBuilder;
