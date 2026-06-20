import React from 'react';
import { X } from 'lucide-react';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const ScheduleWorkoutModal = ({
  isOpen,
  workout,
  scheduleDate,
  setScheduleDate,
  onSchedule,
  onClose,
  getSportTypeDisplayName
}) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  
  if (!isOpen || !workout) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-none sm:max-w-md h-[70vh] sm:h-auto flex flex-col rounded-t-2xl">
        <div className="border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sm:rounded-t-2xl">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            Schedule Workout
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>
        
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Workout Name
            </label>
            <input
              type="text"
              value={workout.name}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sport Type
            </label>
            <input
              type="text"
              value={getSportTypeDisplayName(workout)}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        
        <div className="border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex gap-2 sm:gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
          >
            Cancel
          </button>
          <button
            onClick={onSchedule}
            className="flex-1 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleWorkoutModal;
