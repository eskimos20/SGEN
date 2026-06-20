import { GripVertical } from 'lucide-react';
import { INTERVAL_TYPES } from '../../hooks/useWorkoutSteps';

const DragItemsPalette = ({ onDragStart, onDragEnd, formatDuration }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Drag Items</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {INTERVAL_TYPES.map(type => (
          <div
            key={type.id}
            draggable
            onDragStart={(e) => onDragStart(e, type.id)}
            onDragEnd={onDragEnd}
            className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors cursor-move border-2 border-transparent hover:border-blue-300 min-w-[200px]"
          >
            <GripVertical className="w-5 h-5 text-gray-400" />
            <span className="text-2xl">{type.icon}</span>
            <div className="flex-1">
              <div className="font-medium text-gray-900 text-sm">{type.name}</div>
              <div className="text-xs text-gray-500">
                {formatDuration(type.defaultDuration)}
                {type.isRamp 
                  ? ` ${type.defaultPowerStart}→${type.defaultPowerEnd}%`
                  : type.defaultReps > 1
                  ? ` ${type.defaultReps}x${type.defaultPower}%`
                  : ` @${type.defaultPower}%`
                }
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DragItemsPalette;
