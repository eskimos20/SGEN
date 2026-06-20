import React from 'react';
import { Calendar, Trash2 } from 'lucide-react';
import WorkoutChart from '../workout/WorkoutChart';
import { getSportEmoji } from '../../utils/sportTypeUtils';

const WorkoutCard = ({
  workout,
  expandedWorkoutId,
  onHover,
  onLeave,
  onSchedule,
  onView,
  onDelete,
  getFtpForWorkout,
  getSportType,
  getSportTypeDisplayName
}) => {
  const workoutId = workout.filename || workout.name || JSON.stringify(workout);
  const isExpanded = expandedWorkoutId === workoutId;

  return (
    <div 
      className="border-2 border-gray-200 rounded-xl p-3 sm:p-4 hover:border-blue-300 transition-colors cursor-pointer"
      onClick={() => onView(workout)}
      onMouseEnter={() => onHover(workout)}
      onMouseLeave={onLeave}
    >
      <div className="mb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg" title={getSportTypeDisplayName(workout)}>
                {getSportEmoji(getSportType(workout))}
              </span>
              <h3 className="font-semibold text-gray-900">{workout.name}</h3>
            </div>
            <p className="text-xs text-gray-500">
              {workout.source === 'custom' ? 'Custom' : 'Library'} 
              {' '}
              <span className="text-gray-400">TSS {workout.tss}</span>
              {' '}
              <span className="text-gray-400">{workout.duration}min</span>
            </p>
          </div>
          {workout.source === 'custom' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(workout);
              }}
              className="flex items-center justify-center p-2 bg-white border border-gray-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
              title="Delete workout"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      
      {workout.workout_doc?.steps && (
        <div className="mb-3">
          <WorkoutChart 
            workoutDoc={workout.workout_doc}
            height="h-20"
            ftp={getFtpForWorkout(workout)}
            showTooltip={true}
          />
        </div>
      )}
      
      {workout.description && (
        <p 
          className={`text-xs text-gray-600 cursor-help transition-all duration-200 ${
            isExpanded ? 'line-clamp-none' : 'line-clamp-2'
          }`}
        >
          {workout.description}
        </p>
      )}
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSchedule(workout);
        }}
        className="mt-3 w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
      >
        <Calendar className="w-4 h-4" />
        Schedule
      </button>
    </div>
  );
};

export default WorkoutCard;
