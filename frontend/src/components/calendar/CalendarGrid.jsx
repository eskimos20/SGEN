import React from 'react';
import { ChevronLeft, ChevronRight, Loader2, Activity, Clock } from 'lucide-react';
import WorkoutItemCard from '../workout/WorkoutItemCard';
import { formatDuration } from '../../utils/dataUtils';
import { calculateWeeklyTotals } from '../../utils/calendarUtils';

const CalendarGrid = ({
  currentDate,
  weekDays,
  weekDaysShort,
  monthNames,
  events,
  activities,
  pendingEvents,
  loading,
  error,
  draggedEvent,
  dropTargetDay,
  regeneratingDate,
  selectedCategoryPerDate,
  daysInMonth,
  adjustedStartingDay,
  prevMonthDays,
  prevMonthToShow,
  nextMonthToShow,
  onEventClick,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onRegenerateWorkout,
  onCategoryChange,
  onMoveWorkout,
  getItemsForDay,
  getItemsForAnyDay,
  getMobileDayItems,
  isMobile,
  currentMobileDate,
  navigateMobileDay,
  sportSettings,
  onEmptyDayClick
}) => {

  if (isMobile) {
    // Mobile View - Single Day
    return (
      <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 overflow-hidden">
        {/* Mobile Date Navigation - same as Nutrition */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => navigateMobileDay(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <input
              type="date"
              value={`${currentMobileDate.year}-${String(currentMobileDate.month + 1).padStart(2, '0')}-${String(currentMobileDate.day).padStart(2, '0')}`}
              onChange={(e) => {
                const [year, month, day] = e.target.value.split('-').map(Number);
                navigateMobileDay(0, { year, month: month - 1, day });
              }}
              className="text-lg font-semibold text-gray-900 border-none bg-transparent text-center cursor-pointer focus:ring-0"
              style={{ colorScheme: 'light' }}
            />
          </div>
          <button
            onClick={() => navigateMobileDay(1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        
        {/* Mobile Day Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-red-500 text-sm">
            {error}
          </div>
        ) : (
          <div 
            className={`p-4 min-h-[300px] ${getMobileDayItems().length === 0 ? 'cursor-pointer' : ''}`}
            onClick={() => onEmptyDayClick && onEmptyDayClick(currentMobileDate)}
          >
            {(() => {
              const mobileDayItems = getMobileDayItems();
              const isToday = new Date().toDateString() === new Date(currentMobileDate.year, currentMobileDate.month, currentMobileDate.day).toDateString();
              
              return (
                <div className={`space-y-3 ${isToday ? 'bg-primary-50 rounded-lg p-3 -m-3' : ''}`}
                     onDragOver={(e) => e.preventDefault()}
                     onDrop={(e) => e.preventDefault()}
                   >
                  {mobileDayItems.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <Activity className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No workouts scheduled</p>
                    </div>
                  ) : (
                    mobileDayItems.map((item, itemIdx) => (
                      <WorkoutItemCard
                        key={item.id || `mobile-item-${itemIdx}`}
                        item={item}
                        itemIdx={itemIdx}
                        isMobile={true}
                        isRegenerating={regeneratingDate === item.start_date_local?.substring(0, 10)}
                        draggedEvent={draggedEvent}
                        selectedCategoryPerDate={selectedCategoryPerDate}
                        sportSettings={sportSettings}
                        onEventClick={onEventClick}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onRegenerateWorkout={onRegenerateWorkout}
                        onCategoryChange={onCategoryChange}
                        onMoveWorkout={onMoveWorkout}
                      />
                    ))
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  // Desktop View - Traditional Calendar Grid
  return (
    <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 overflow-hidden">
      {/* Week day headers */}
      <div className="grid grid-cols-[120px_1fr] bg-gray-50 border-b border-gray-200">
        <div className="border-r border-gray-200" />
        <div className="grid grid-cols-7">
          {weekDays.map(day => (
            <div key={day} className="px-1 sm:px-2 py-2 sm:py-3 text-center text-xs sm:text-sm font-medium text-gray-600">
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.substring(0, 1)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar days */}
      {loading ? (
        <div className="flex items-center justify-center h-64 sm:h-96">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary-600" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64 sm:h-96 text-red-500 text-sm sm:text-base">
          {error}
        </div>
      ) : (
        <div>
          {/* Render calendar by weeks */}
          {Array.from({ length: Math.ceil((daysInMonth + adjustedStartingDay) / 7) }).map((_, weekIdx) => {
            const weekTotals = calculateWeeklyTotals(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              weekIdx,
              activities,
              events,
              pendingEvents
            );
            
            const [weekDurationText, weekTssText] = weekTotals.displayText.split(' / ');
            return (
              <div key={`week-${weekIdx}`} className="grid grid-cols-[120px_1fr]">
                <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-2 text-center bg-gray-50 border-b border-r border-gray-200">
                  <div className="text-xs font-semibold text-gray-700">Week {weekTotals.isoWeekNumber}</div>
                  <div className="text-xs text-gray-600">{weekDurationText}</div>
                  <div className="text-xs text-gray-600">{weekTssText}</div>
                  {weekTotals.distance > 0 && (
                    <div className="text-xs text-gray-600">{weekTotals.distance} km</div>
                  )}
                  {weekTotals.elevation > 0 && (
                    <div className="text-xs text-gray-600">+{weekTotals.elevation}m</div>
                  )}
                  {weekTotals.isDeloadWeek && (
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Deload</div>
                  )}
                </div>
                {/* Week row */}
                <div className="grid grid-cols-7">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const cellIndex = weekIdx * 7 + dayIdx;
                    let dayNumber, isCurrentMonth = false, isPrevMonth = false, isNextMonth = false;
                    
                    // Determine if this cell shows previous month, current month, or next month
                    if (cellIndex < adjustedStartingDay) {
                      // Previous month
                      isPrevMonth = true;
                      dayNumber = prevMonthDays - adjustedStartingDay + cellIndex + 1;
                    } else if (cellIndex < adjustedStartingDay + daysInMonth) {
                      // Current month
                      isCurrentMonth = true;
                      dayNumber = cellIndex - adjustedStartingDay + 1;
                    } else {
                      // Next month
                      isNextMonth = true;
                      dayNumber = cellIndex - adjustedStartingDay - daysInMonth + 1;
                    }
                    
                    let dayItems = [];
                    let isToday = false;
                    let dateInfo = { year: currentDate.getFullYear(), month: currentDate.getMonth(), day: dayNumber };
                    
                    // Get items for the day based on which month it belongs to
                    if (isCurrentMonth) {
                      dayItems = getItemsForDay(dayNumber);
                      isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNumber).toDateString();
                    } else if (isPrevMonth) {
                      // Previous month - calculate year and month
                      const prevMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                      const prevYear = prevMonthDate.getFullYear();
                      const prevMonth = prevMonthDate.getMonth();
                      dateInfo = { year: prevYear, month: prevMonth, day: dayNumber };
                      dayItems = getItemsForAnyDay(prevYear, prevMonth, dayNumber);
                      isToday = new Date().toDateString() === new Date(prevYear, prevMonth, dayNumber).toDateString();
                    } else if (isNextMonth) {
                      // Next month - calculate year and month
                      const nextMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                      const nextYear = nextMonthDate.getFullYear();
                      const nextMonth = nextMonthDate.getMonth();
                      dateInfo = { year: nextYear, month: nextMonth, day: dayNumber };
                      dayItems = getItemsForAnyDay(nextYear, nextMonth, dayNumber);
                      isToday = new Date().toDateString() === new Date(nextYear, nextMonth, dayNumber).toDateString();
                    }
                    
                    const isDropTarget = dropTargetDay && 
                      dropTargetDay.year === dateInfo.year && 
                      dropTargetDay.month === dateInfo.month && 
                      dropTargetDay.day === dateInfo.day;
                    
                    return (
                      <div
                        key={`${weekIdx}-${dayIdx}`}
                        className={`min-h-[80px] sm:min-h-[120px] border-b border-r border-gray-100 p-1 transition-colors ${
                          isToday ? 'bg-primary-50' : isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                        } ${isDropTarget ? 'bg-blue-100 border-blue-400 border-2' : ''} cursor-pointer hover:bg-gray-50`}
                        onDragOver={(e) => onDragOver(e, dateInfo)}
                        onDragLeave={(e) => onDragLeave(e)}
                        onDrop={(e) => onDrop(e, dateInfo)}
                        onClick={() => onEmptyDayClick && onEmptyDayClick(dateInfo)}
                      >
                        <div className={`text-xs sm:text-sm font-medium mb-1 ${
                          isToday ? 'text-primary-600' : isCurrentMonth ? 'text-gray-600' : 'text-gray-400'
                        }`}>
                          {dayNumber}
                        </div>
                        
                        {dayItems && dayItems.length > 0 && (
                          <div className="space-y-1"
                             onDragOver={(e) => e.preventDefault()}
                             onDrop={(e) => e.preventDefault()}
                           >
                            {/* Show drag preview at the top when hovering over this day */}
                            {isDropTarget && draggedEvent && (
                              <div className="text-xs p-1 sm:p-2 rounded-lg bg-blue-100 border-2 border-dashed border-blue-400 opacity-70"
                                   onDragOver={(e) => e.preventDefault()}
                                   onDrop={(e) => e.preventDefault()}
                                 >
                                <div className="flex items-center gap-1 font-medium">
                                  <Activity className="h-3 w-3 flex-shrink-0 text-blue-600" />
                                  <span className="truncate text-blue-800 text-xs">
                                    {draggedEvent.name || 'Workout'}
                                  </span>
                                </div>
                                {draggedEvent.moving_time && (
                                  <div className="flex items-center gap-2 mt-1 text-blue-600 text-xs">
                                    <span className="flex items-center gap-0.5">
                                      <Clock className="h-2.5 w-2.5" />
                                      {formatDuration(draggedEvent.moving_time)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                            {dayItems.slice(0, isDropTarget && draggedEvent ? 2 : 3).map((item, itemIdx) => (
                              <WorkoutItemCard
                                key={item.id || `item-${itemIdx}`}
                                item={item}
                                itemIdx={itemIdx}
                                isMobile={false}
                                isRegenerating={regeneratingDate === item.start_date_local?.substring(0, 10)}
                                draggedEvent={draggedEvent}
                                selectedCategoryPerDate={selectedCategoryPerDate}
                                sportSettings={sportSettings}
                                onEventClick={onEventClick}
                                onDragStart={onDragStart}
                                onDragEnd={onDragEnd}
                                onRegenerateWorkout={onRegenerateWorkout}
                                onCategoryChange={onCategoryChange}
                                onMoveWorkout={onMoveWorkout}
                              />
                            ))}
                            {dayItems.length > (isDropTarget && draggedEvent ? 2 : 3) && (
                              <div className="text-xs text-gray-500 text-center">
                                +{dayItems.length - (isDropTarget && draggedEvent ? 2 : 3)} more
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default React.memo(CalendarGrid);
