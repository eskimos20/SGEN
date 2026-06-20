import React from 'react';
import { X } from 'lucide-react';

const ENTRY_TYPES = [
  {
    id: 'wellness',
    label: 'Wellness Data',
    category: 'WELLNESS',
    requiresFile: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    color: 'text-gray-600'
  },
  {
    id: 'ride',
    label: 'Ride',
    category: 'WORKOUT',
    type: 'Ride',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="18" cy="18" r="4" /><circle cx="6" cy="18" r="4" />
        <path d="M12 11.5L6 18M12 11.5l4.5 1.5M12 11.5V8" />
        <circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
    color: 'text-blue-600'
  },
  {
    id: 'run',
    label: 'Run',
    category: 'WORKOUT',
    type: 'Run',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="14" cy="4" r="1.5" fill="currentColor" stroke="none" />
        <path d="M7 19l3-4 3 1 2-5" /><path d="M18 9l-4-3-3 3-3-1" />
      </svg>
    ),
    color: 'text-green-600'
  },
  {
    id: 'swim',
    label: 'Swim',
    category: 'WORKOUT',
    type: 'Swim',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        <path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
    color: 'text-cyan-600'
  },
  {
    id: 'weight_training',
    label: 'Weight Training',
    category: 'WORKOUT',
    type: 'WeightTraining',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M6 5v14M18 5v14" /><path d="M2 9h4M18 9h4M2 15h4M18 15h4" />
        <path d="M6 9h12M6 15h12" />
      </svg>
    ),
    color: 'text-purple-600'
  },
  {
    id: 'walk',
    label: 'Walk',
    category: 'WORKOUT',
    type: 'Walk',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="13" cy="4" r="1.5" fill="currentColor" stroke="none" />
        <path d="M7.5 21l2-5 2 2 3-7" /><path d="M17 21l-2-4" />
        <path d="M9.5 11l-2-3 4.5-2 2 3-3 2" />
      </svg>
    ),
    color: 'text-orange-600'
  },
  {
    id: 'other_workout',
    label: 'Other Workout',
    category: 'WORKOUT',
    type: 'Other',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    color: 'text-gray-600'
  },
  {
    id: 'manual_activity',
    label: 'Manual Activity',
    category: 'WORKOUT',
    type: 'Ride',
    manual: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
    color: 'text-indigo-600'
  },
  {
    id: 'note',
    label: 'Note',
    category: 'NOTE',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
    color: 'text-gray-600'
  },
  {
    id: 'race_a',
    label: 'A Race',
    category: 'RACE_A',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
    color: 'text-red-600'
  },
  {
    id: 'race_b',
    label: 'B Race',
    category: 'RACE_B',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
    color: 'text-orange-500'
  },
  {
    id: 'race_c',
    label: 'C Race',
    category: 'RACE_C',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
    color: 'text-yellow-500'
  },
  {
    id: 'holiday',
    label: 'Holiday',
    category: 'HOLIDAY',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M17 9a5 5 0 00-10 0c0 6 5 10 5 10s5-4 5-10z" />
        <circle cx="12" cy="9" r="2" />
      </svg>
    ),
    color: 'text-blue-500'
  },
  {
    id: 'sick',
    label: 'Sick',
    category: 'SICK',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9h.01M15 9h.01M9.5 15.5c.5-1 2-1.5 2.5-1.5s2 .5 2.5 1.5" />
      </svg>
    ),
    color: 'text-green-500'
  },
  {
    id: 'injured',
    label: 'Injured',
    category: 'INJURED',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
    color: 'text-red-500'
  },
  {
    id: 'season',
    label: 'Season',
    category: 'SEASON_START',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    color: 'text-yellow-600'
  },
  ];

const AddCalendarEntryTypeModal = ({ isOpen, onClose, onSelectType, date }) => {
  if (!isOpen) return null;

  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden h-[85vh] sm:h-auto sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-t-2xl">
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 bg-blue-600 sm:rounded-t-2xl sticky top-0 z-10">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-lg font-semibold text-white truncate">Add Calendar Entry</h3>
            {formattedDate && (
              <p className="text-xs text-blue-200 mt-0.5 truncate">{formattedDate}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-blue-700 rounded-lg transition-colors flex-shrink-0 ml-2"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 max-h-[70vh] overflow-y-auto flex-1">
          {ENTRY_TYPES.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelectType(entry)}
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-lg hover:bg-gray-100 transition-colors text-center min-h-[80px] sm:min-h-[100px]"
            >
              <span className={entry.color}>{React.cloneElement(entry.icon, { className: "h-5 w-5 sm:h-6 sm:w-6" })}</span>
              <span className="text-xs sm:text-sm font-medium text-gray-800 leading-tight">{entry.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AddCalendarEntryTypeModal;
