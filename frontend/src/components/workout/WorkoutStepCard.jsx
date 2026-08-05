import { GripVertical, Trash2, Edit2, Copy } from 'lucide-react';
import { INTERVAL_TYPES } from '../../hooks/useWorkoutSteps';
import { formatPaceFromVelocity } from '../../utils/zoneUtils';

const WorkoutStepCard = ({
  step,
  index,
  isDragging,
  onDragStart,
  onEdit,
  onRemove,
  onCopy,
  formatDuration,
  usePace = false,
  thresholdPace = null,
  paceUnits = null,
  disabled = false
}) => {
  const intervalType = INTERVAL_TYPES.find(t => t.id === step.type);
  const intensity = (pct) => usePace && thresholdPace > 0
    ? formatPaceFromVelocity(thresholdPace * pct / 100, paceUnits)
    : `${pct}% FTP`;

  return (
    <div
      draggable={!disabled}
      onDragStart={disabled ? undefined : (e) => onDragStart(e, index)}
      className={`flex-shrink-0 w-48 bg-white border-2 rounded-lg p-3 transition-all ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : `cursor-move ${isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md'}`
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-gray-400" />
          <span className="text-lg">{intervalType?.icon}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => !disabled && onEdit(step)}
            disabled={disabled}
            className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-40"
            title="Edit"
          >
            <Edit2 className="h-3.5 w-3.5 text-gray-600" />
          </button>
          <button
            onClick={() => !disabled && onCopy(step)}
            disabled={disabled}
            className="p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-40"
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5 text-blue-600" />
          </button>
          <button
            onClick={() => !disabled && onRemove(step.id)}
            disabled={disabled}
            className="p-1 hover:bg-red-100 rounded transition-colors disabled:opacity-40"
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
            <div>{intensity(step.powerStart)} → {intensity(step.powerEnd)}</div>
            <div>{formatDuration(step.duration)}</div>
          </>
        ) : step.type === 'interval' ? (
          <>
            <div>{step.reps}x {intensity(step.power)}</div>
            <div>{formatDuration(step.duration)} work</div>
            <div>{formatDuration(step.restDuration)} rest @ {intensity(step.restPower)}</div>
          </>
        ) : (
          <>
            <div>{intensity(step.power)}</div>
            <div>{formatDuration(step.duration)}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkoutStepCard;
