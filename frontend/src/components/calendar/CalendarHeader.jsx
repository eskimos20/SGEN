import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle, X, Loader2, Trash2 } from 'lucide-react';

const CalendarHeader = ({
  currentDate,
  monthNames,
  pendingEvents,
  loadingSchedulerData,
  isCommitting,
  onNavigateMonth,
  onOpenScheduler,
  onCommitSchedule,
  onClearSchedule,
  onOpenDeleteRange
}) => {
  return (
    <div className="flex flex-col gap-3">
      {/* Title row */}
      <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Training Calendar</h1>
        <p className="text-gray-600 mt-1">Planned workouts</p>
      </div>

      {/* Action buttons row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left side: Month navigation (desktop) + Scheduler, Commit/Clear buttons */}
        <div className="flex items-center gap-2 ml-2 sm:ml-3">
          {/* Month navigation - desktop only (mobile uses date picker in grid) */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => onNavigateMonth(-1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold min-w-[130px] text-center">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
            <button
              onClick={() => onNavigateMonth(1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={onOpenScheduler}
            disabled={loadingSchedulerData}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-sm"
          >
            {loadingSchedulerData ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarIcon className="h-4 w-4" />
            )}
            <span className="font-medium">Scheduler</span>
          </button>
          {pendingEvents.length > 0 && (
          <>
            <button
              onClick={onCommitSchedule}
              disabled={isCommitting}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-sm"
            >
              {isCommitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              <span className="font-medium">Commit ({pendingEvents.length})</span>
            </button>
            <button
              onClick={onClearSchedule}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg text-sm"
            >
              <X className="h-4 w-4" />
              <span className="font-medium">Clear</span>
            </button>
          </>
        )}
        </div>

        {/* Right side: Trash with margin from edge */}
        <div className="flex items-center mr-2 sm:mr-3">
          <button
            onClick={onOpenDeleteRange}
            className="flex items-center justify-center p-2 bg-white border border-gray-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
            title="Delete scheduled workouts"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarHeader;
