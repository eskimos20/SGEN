import React, { useState } from 'react';
import { X, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const MoveWorkoutModal = ({ 
  isOpen, 
  onClose, 
  workout, 
  onMove 
}) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);

  if (!isOpen || !workout) return null;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Adjust for Monday-first week (0 = Monday, 6 = Sunday)
    let startingDay = firstDay.getDay() - 1;
    if (startingDay === -1) startingDay = 6;
    
    return { daysInMonth, startingDay };
  };

  const parseWorkoutDate = (dateStr) => {
    // Parse only the date part to avoid timezone issues on mobile Safari
    const datePart = dateStr?.substring(0, 10);
    if (!datePart) return null;
    const [y, m, d] = datePart.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const handleDateSelect = (day) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const newDate = new Date(year, month, day);
    
    // Don't allow past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) return;
    
    // Don't allow same date as current workout
    const currentWorkoutDate = parseWorkoutDate(workout.start_date_local);
    if (currentWorkoutDate && newDate.getTime() === currentWorkoutDate.getTime()) return;
    
    setSelectedDate(newDate);
  };

  const handleMove = async () => {
    if (selectedDate && onMove) {
      // Use local date methods to match Intervals.icu format
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      await onMove(workout, dateStr);
      onClose();
    }
  };

  const navigateMonth = (direction) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === -1) {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-t-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 sm:rounded-t-xl">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Move Workout</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Workout Info */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-600"></div>
            <span className="font-medium text-gray-900">{workout.name}</span>
          </div>
          <div className="text-sm text-gray-600">
            Current date: {parseWorkoutDate(workout.start_date_local)?.toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
        </div>

        {/* Calendar */}
        <div className="p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <h3 className="font-medium text-gray-900">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h3>
            <button
              onClick={() => navigateMonth(1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>

          {/* Week days */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-600 py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before month starts */}
            {Array.from({ length: startingDay }).map((_, index) => (
              <div key={`empty-${index}`} className="h-8"></div>
            ))}
            
            {/* Days of the month */}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
              const isPast = date < today;
              const workoutDate = parseWorkoutDate(workout.start_date_local);
              const isCurrentWorkoutDate = workoutDate && date.toDateString() === workoutDate.toDateString();
              const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
              const isToday = date.toDateString() === today.toDateString();

              return (
                <button
                  key={day}
                  onClick={() => handleDateSelect(day)}
                  disabled={isPast || isCurrentWorkoutDate}
                  className={`h-8 rounded-lg text-xs font-medium transition-colors ${
                    isPast 
                      ? 'text-gray-300 cursor-not-allowed bg-gray-50' 
                      : isCurrentWorkoutDate
                        ? 'text-gray-400 cursor-not-allowed bg-gray-100'
                        : isSelected
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : isToday
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={!selectedDate}
            className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium ${
              selectedDate
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Move Workout
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveWorkoutModal;
