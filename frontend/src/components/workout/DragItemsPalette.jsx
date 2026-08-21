import { useState } from 'react';
import { GripVertical, Check } from 'lucide-react';
import { INTERVAL_TYPES } from '../../hooks/useWorkoutSteps';
import ConfirmDialog from '../modals/ConfirmDialog';

const DragItemsPalette = ({ onDragStart, onDragEnd, onAddStep, formatDuration, disabled = false, isMobile = false }) => {
  const [selectedType, setSelectedType] = useState(null);

  const handleMobileClick = (type) => {
    if (disabled || !isMobile) return;
    setSelectedType(type);
  };

  const handleConfirm = () => {
    if (selectedType) {
      onAddStep(selectedType.id);
      setSelectedType(null);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 ${disabled ? 'opacity-60' : ''}`}>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {isMobile ? 'Add Items' : 'Drag Items'}
      </h2>
      <div className={`flex ${isMobile ? 'flex-col gap-3' : 'gap-3 overflow-x-auto pb-2'}`}>
        {INTERVAL_TYPES.map(type => (
          <div
            key={type.id}
            draggable={!disabled && !isMobile}
            onDragStart={disabled || isMobile ? undefined : (e) => onDragStart(e, type.id)}
            onDragEnd={disabled || isMobile ? undefined : onDragEnd}
            onClick={() => handleMobileClick(type)}
            className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg transition-colors border-2 border-transparent w-full md:w-auto md:min-w-[200px] ${
              disabled
                ? 'cursor-not-allowed opacity-50'
                : isMobile
                  ? 'cursor-pointer hover:bg-gray-100 hover:border-blue-300'
                  : 'hover:bg-gray-100 hover:border-blue-300 cursor-move'
            }`}
          >
            <div className="p-2 -m-2">
              {isMobile ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <GripVertical className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <span className="text-2xl">{type.icon}</span>
            <div className="flex-1 min-w-0">
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

      <ConfirmDialog
        isOpen={!!selectedType}
        title="Add Item"
        message={selectedType ? `Add ${selectedType.name} to the workout?` : ''}
        confirmText="Add"
        cancelText="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setSelectedType(null)}
      />
    </div>
  );
};

export default DragItemsPalette;
