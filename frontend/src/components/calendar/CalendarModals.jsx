import React from 'react';
import { X } from 'lucide-react';
import ConfirmDialog from '../modals/ConfirmDialog';
import SchedulerModal from '../modals/SchedulerModal';
import AddCalendarEntryTypeModal from './AddCalendarEntryTypeModal';
import AddCalendarEntryModal from './AddCalendarEntryModal';
import EventDetailModal from './EventDetailModal';
import UploadActivityModal from '../activities/UploadActivityModal';
import MoveWorkoutModal from './MoveWorkoutModal';
import { getCalendarDisplayRange } from '../../utils/calendarUtils';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

/**
 * CalendarModals component
 * Consolidates all modal components from Calendar.jsx
 */
const CalendarModals = ({
  // Event Detail Modal
  selectedEvent,
  setSelectedEvent,
  activityDetails,
  setActivityDetails,
  detailsLoading,
  setDetailsLoading,
  stravaData,
  setStravaData,
  stravaLoading,
  setStravaLoading,
  athleteProfile,
  isDeleting,
  handleDeleteEvent,
  setActivities,
  currentDate,
  refreshCalendarData,
  pendingEvents,
  
  // Delete Range Modal
  showDeleteRange,
  setShowDeleteRange,
  deleteRange,
  setDeleteRange,
  isDeletingRange,
  handleDeleteRange,
  
  // Upload Modal
  showUpload,
  setShowUpload,
  
  // Scheduler Modal
  showScheduler,
  setShowScheduler,
  schedulerData,
  setSchedulerData,
  handleEventsCreated,
  
  // Confirm/Alert Dialogs
  confirmDialog,
  setConfirmDialog,
  alertDialog,
  setAlertDialog,
  
  // Move Workout Modal
  showMoveWorkout,
  setShowMoveWorkout,
  workoutToMove,
  setWorkoutToMove,
  handleMoveWorkout,
  
  // Add Entry Modals
  showAddEntryType,
  setShowAddEntryType,
  showAddEntry,
  setShowAddEntry,
  selectedEntryType,
  setSelectedEntryType,
  selectedDate,
  setSelectedDate,
  handleEntryTypeSelect,
  handleEntryCreated
}) => {
  // Lock background scroll when Delete Scheduled Workouts modal is open
  useLockBodyScroll(showDeleteRange);
  
  return (
    <>
      {/* Event Detail Modal */}
      <EventDetailModal
        selectedEvent={selectedEvent}
        activityDetails={activityDetails}
        detailsLoading={detailsLoading}
        stravaData={stravaData}
        stravaLoading={stravaLoading}
        athleteProfile={athleteProfile}
        isDeleting={isDeleting}
        onClose={() => setSelectedEvent(null)}
        onDeleteEvent={() => handleDeleteEvent(pendingEvents)}
        setActivities={setActivities}
        setSelectedEvent={setSelectedEvent}
        setActivityDetails={setActivityDetails}
        setDetailsLoading={setDetailsLoading}
        onIntervalsApplied={async () => {
          const { oldest, newest } = getCalendarDisplayRange(currentDate);
          await refreshCalendarData(oldest, newest);
        }}
      />

      {/* Delete Scheduled Workouts Modal */}
      {showDeleteRange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-auto max-h-[80vh] rounded-t-2xl sm:rounded-t-2xl">
            <div className="border-b border-gray-200 px-4 sm:px-5 py-4 bg-gray-50 sm:rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Delete Scheduled Workouts</h3>
                <p className="text-xs sm:text-sm text-gray-500">Remove planned workouts within a date range.</p>
              </div>
              <button
                onClick={() => setShowDeleteRange(false)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0 ml-2"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={deleteRange.startDate}
                    onChange={(e) => setDeleteRange(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">End Date</label>
                  <input
                    type="date"
                    value={deleteRange.endDate}
                    onChange={(e) => setDeleteRange(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-row justify-end gap-2 border-t border-gray-200 px-4 sm:px-5 py-4 bg-gray-50">
              <button
                onClick={() => setShowDeleteRange(false)}
                className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRange(deleteRange)}
                disabled={isDeletingRange}
                className="px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60 text-sm"
              >
                {isDeletingRange ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Activity Modal */}
      <UploadActivityModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onUploadSuccess={() => {
          const { oldest, newest } = getCalendarDisplayRange(currentDate);
          refreshCalendarData(oldest, newest);
        }}
      />

      {/* Scheduler Modal */}
      <SchedulerModal
        isOpen={showScheduler}
        onClose={() => {
          setShowScheduler(false);
          setSchedulerData(null);
        }}
        fitnessData={schedulerData?.fitness}
        onEventsCreated={handleEventsCreated}
        athleteProfile={athleteProfile}
      />

      {/* Custom Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.show}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
      />

      {/* Alert Dialog (no cancel button) */}
      <ConfirmDialog
        isOpen={alertDialog.show}
        title={alertDialog.title}
        message={alertDialog.message}
        confirmText="OK"
        onConfirm={() => setAlertDialog({ show: false, title: '', message: '' })}
      />

      {/* Move Workout Modal */}
      <MoveWorkoutModal
        isOpen={showMoveWorkout}
        onClose={() => {
          setShowMoveWorkout(false);
          setWorkoutToMove(null);
        }}
        workout={workoutToMove}
        onMove={handleMoveWorkout}
      />

      {/* Add Calendar Entry Type Modal */}
      <AddCalendarEntryTypeModal
        isOpen={showAddEntryType}
        onClose={() => {
          setShowAddEntryType(false);
          setSelectedDate(null);
        }}
        onSelectType={handleEntryTypeSelect}
        date={selectedDate}
      />

      {/* Add Calendar Entry Modal */}
      <AddCalendarEntryModal
        isOpen={showAddEntry}
        onClose={() => {
          setShowAddEntry(false);
          setSelectedEntryType(null);
          setSelectedDate(null);
        }}
        entryType={selectedEntryType}
        date={selectedDate}
        onCreated={handleEntryCreated}
      />
    </>
  );
};

export default React.memo(CalendarModals);
