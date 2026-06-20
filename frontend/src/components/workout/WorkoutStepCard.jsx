import { GripVertical, Trash2, Edit2 } from 'lucide-react';
import { INTERVAL_TYPES } from '../../hooks/useWorkoutSteps';

const WorkoutStepCard = ({
  step,
  index,
  isDragging,
  onDragStart,
  onEdit,
  onRemove,
  formatDuration
}) => {
  const intervalType = INTERVAL_TYPES.find(t => t.id === step.type);
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      className={`flex-shrink-0 w-48 bg-white border-2 rounded-lg p-3 cursor-move transition-all ${
        isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-gray-400" />
          <span className="text-lg">{intervalType?.icon}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(step)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Edit"
          >
            <Edit2 className="h-3.5 w-3.5 text-gray-600" />
          </button>
          <button
            onClick={() => onRemove(step.id)}
            className="p-1 hover:bg-red-100 rounded transition-colors"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-600" />
          </button>
        </div>
      </div>
      
      <div className="text-sm font-medium text-gray-900 mb-1">
        {intervalType?.name}
      </div>
      
      <div className="text-xs text-gray-600 space-y-0.5">
        {intervalType?.isRamp ? (
          <>
            <div>{step.powerStart}% → {step.powerEnd}% FTP</div>
            <div>{formatDuration(step.duration)}</div>
          </>
        ) : step.type === 'interval' ? (
          <>
            <div>{step.reps}x {step.power}% FTP</div>
            <div>{formatDuration(step.duration)} work</div>
            <div>{formatDuration(step.restDuration)} rest @ {step.restPower}%</div>
          </>
        ) : (
          <>
            <div>{step.power}% FTP</div>
            <div>{formatDuration(step.duration)}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkoutStepCard;
