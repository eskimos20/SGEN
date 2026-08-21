import { INTERVAL_TYPES } from '../../hooks/useWorkoutSteps';

const IntervalTypeSelector = ({ onDragStart }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Interval Palette</h2>
      <div className="space-y-2">
        {INTERVAL_TYPES.map((type) => (
          <div
            key={type.id}
            draggable
            onDragStart={(e) => onDragStart(e, type.id)}
            className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-move transition-colors border border-gray-200"
          >
            <span className="text-2xl">{type.icon}</span>
            <div className="flex-1">
              <div className="font-medium text-gray-900">{type.name}</div>
              <div className="text-xs text-gray-500">
                {type.isRamp 
                  ? `${type.defaultPowerStart}-${type.defaultPowerEnd}% FTP, ${type.defaultDuration}s`
                  : type.id === 'interval'
                    ? `${type.defaultPower}% FTP, ${type.defaultReps}x${type.defaultDuration}s`
                    : `${type.defaultPower}% FTP, ${type.defaultDuration}s`
                }
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IntervalTypeSelector;
