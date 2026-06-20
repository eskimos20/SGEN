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
  onEditStep,
  onRemoveStep,
  formatDuration
}) => {
  if (steps.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Workout Builder (0 intervals)
        </h2>
        <div
          onDragOver={(e) => onDragOver(e, 0)}
          onDrop={(e) => onDrop(e, 0)}
          className="h-80 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg bg-gray-50"
        >
          <p className="text-gray-500 text-lg font-medium">Drop intervals here to start building</p>
          <p className="text-gray-400 text-sm mt-2">Drag from the interval palette on the left</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
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
          className="mb-16 h-32 bg-gray-50 rounded-lg relative"
          onDragOver={(e) => {
            if (draggedType || draggedStepIndex !== null) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onDrop={(e) => {
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
          />
          {/* Drop overlay */}
          {(draggedType || draggedStepIndex !== null) && (
            <div className="absolute inset-0 bg-blue-500/10 border-2 border-blue-500 border-dashed rounded-lg flex items-center justify-center pointer-events-none">
              <p className="text-blue-600 font-semibold">Drop to add at end</p>
            </div>
          )}
        </div>

        {/* Horizontal Interval Cards */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-min">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                {/* Drop indicator before this card */}
                {dropTargetIndex === index && (
                  <div className="flex-shrink-0 w-1 bg-blue-500 rounded-full" />
                )}
                
                <WorkoutStepCard
                  step={step}
                  index={index}
                  isDragging={draggedStepIndex === index}
                  onDragStart={onStepDragStart}
                  onEdit={onEditStep}
                  onRemove={onRemoveStep}
                  formatDuration={formatDuration}
                />
              </React.Fragment>
            ))}
            
            {/* Drop indicator at end */}
            {dropTargetIndex === steps.length && (
              <div className="flex-shrink-0 w-1 bg-blue-500 rounded-full" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkoutBuilder;
