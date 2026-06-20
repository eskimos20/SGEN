import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCalendar } from '../context/CalendarContext';
import { Search } from 'lucide-react';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import SearchFilters from '../components/search/SearchFilters';
import WorkoutCard from '../components/search/WorkoutCard';
import ScheduleWorkoutModal from '../components/search/ScheduleWorkoutModal';
import WorkoutDetailModal from '../components/search/WorkoutDetailModal';
import { useWorkoutSearch } from '../hooks/useWorkoutSearch';
import { useWorkoutSchedule } from '../hooks/useWorkoutSchedule';

const SearchWorkouts = () => {
  useAuth();
  const { refreshCalendarData } = useCalendar();
  
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, workout: null, filename: '' });
  const [detailWorkout, setDetailWorkout] = useState(null);
  const [athleteProfile, setAthleteProfile] = useState(null);
  
  const {
    searchCategories,
    setSearchCategories,
    searchTssRange,
    setSearchTssRange,
    searchDurationRange,
    setSearchDurationRange,
    searchLibrary,
    setSearchLibrary,
    searchSportType,
    setSearchSportType,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    searchResults,
    textFilter,
    setTextFilter,
    filteredResults,
    isSearching,
    expandedWorkoutId,
    setExpandedWorkoutId,
    getFtpForWorkout,
    getSportType,
    getSportTypeDisplayName,
    toggleSearchCategory,
    handleSearchWorkouts,
    handleSortChange,
    handleDeleteWorkout
  } = useWorkoutSearch();
  
  const {
    selectedWorkout,
    showScheduleModal,
    scheduleDate,
    setScheduleDate,
    handleScheduleWorkout,
    openScheduleModal,
    closeScheduleModal
  } = useWorkoutSchedule(refreshCalendarData, getSportType);

  React.useEffect(() => {
    import('../api/axios').then(({ default: api }) => {
      api.get('/statistics/athlete-profile').then(r => setAthleteProfile(r.data)).catch(() => {});
    });
  }, []);
  
  const handleWorkoutHover = (workout) => {
    const workoutId = workout.filename || workout.name || JSON.stringify(workout);
    setExpandedWorkoutId(workoutId);
  };

  const handleViewWorkout = (workout) => {
    setDetailWorkout(workout);
  };

  const handleWorkoutLeave = () => {};

  const onDeleteWorkout = (workout) => {
    setDeleteDialog({
      isOpen: true,
      workout: workout,
      filename: workout.filename
    });
  };

  const confirmDeleteWorkout = async () => {
    try {
      await handleDeleteWorkout(deleteDialog.filename);
      setDeleteDialog({ isOpen: false, workout: null, filename: '' });
    } catch (err) {
      console.error('Failed to delete workout:', err);
      alert('Failed to delete workout. Please try again.');
    }
  };

  const onSearch = async () => {
    try {
      await handleSearchWorkouts();
    } catch (err) {
      setConfirmDialog({
        isOpen: true,
        title: 'Search Failed',
        message: 'Failed to search workouts. Please try again.',
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }),
        onCancel: null
      });
    }
  };

  const onScheduleWorkout = async () => {
    try {
      const workoutName = await handleScheduleWorkout();
      setConfirmDialog({
        isOpen: true,
        title: 'Success',
        message: `Workout "${workoutName}" scheduled successfully!`,
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }),
        onCancel: null
      });
    } catch (err) {
      setConfirmDialog({
        isOpen: true,
        title: err.message === 'Please select a date to schedule the workout.' ? 'Date Required' : 'Schedule Failed',
        message: err.message || 'Failed to schedule workout. Please try again.',
        confirmText: 'OK',
        confirmStyle: err.message === 'Please select a date to schedule the workout.' ? undefined : 'danger',
        onConfirm: () => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }),
        onCancel: null
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Search Workouts</h1>
          <p className="text-gray-600 mt-1">Find and schedule workouts from the library</p>
        </div>

        <SearchFilters
          searchCategories={searchCategories}
          toggleSearchCategory={toggleSearchCategory}
          searchTssRange={searchTssRange}
          setSearchTssRange={setSearchTssRange}
          searchDurationRange={searchDurationRange}
          setSearchDurationRange={setSearchDurationRange}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          searchLibrary={searchLibrary}
          setSearchLibrary={setSearchLibrary}
          searchSportType={searchSportType}
          setSearchSportType={setSearchSportType}
          onSearch={onSearch}
          isSearching={isSearching}
          handleSortChange={handleSortChange}
        />

        
        {/* Search Results */}
        <div className="bg-white rounded-xl sm:shadow-sm p-3 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Results</h2>
            <div className="text-sm text-gray-600">
              {filteredResults.length}{textFilter.trim() ? ` of ${searchResults.length}` : ''} workout{filteredResults.length !== 1 ? 's' : ''} found
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={textFilter}
                onChange={e => setTextFilter(e.target.value)}
                placeholder="Filter results by name or description..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}
          
          <div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            onMouseLeave={() => setExpandedWorkoutId(null)}
          >
            {filteredResults.map((workout, idx) => (
              <WorkoutCard
                key={idx}
                workout={workout}
                expandedWorkoutId={expandedWorkoutId}
                onHover={handleWorkoutHover}
                onLeave={handleWorkoutLeave}
                onView={handleViewWorkout}
                onSchedule={openScheduleModal}
                onDelete={onDeleteWorkout}
                getFtpForWorkout={getFtpForWorkout}
                getSportType={getSportType}
                getSportTypeDisplayName={getSportTypeDisplayName}
              />
            ))}
          </div>
          
          {filteredResults.length === 0 && !isSearching && (
            <div className="text-center py-12 text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No workouts found. Try adjusting your filters.</p>
            </div>
          )}
        </div>
      </div>

      <WorkoutDetailModal
        isOpen={!!detailWorkout}
        workout={detailWorkout}
        athleteProfile={athleteProfile}
        onClose={() => setDetailWorkout(null)}
        onSchedule={openScheduleModal}
        getSportType={getSportType}
        getSportTypeDisplayName={getSportTypeDisplayName}
      />

      <ScheduleWorkoutModal
        isOpen={showScheduleModal}
        workout={selectedWorkout}
        scheduleDate={scheduleDate}
        setScheduleDate={setScheduleDate}
        onSchedule={onScheduleWorkout}
        onClose={closeScheduleModal}
        getSportTypeDisplayName={getSportTypeDisplayName}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        confirmStyle={confirmDialog.confirmStyle}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
      />

      {/* Delete Workout Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete Workout"
        message={`Are you sure you want to delete "${deleteDialog.workout?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmStyle="danger"
        onConfirm={confirmDeleteWorkout}
        onCancel={() => setDeleteDialog({ isOpen: false, workout: null, filename: '' })}
      />
    </div>
  );
};

export default SearchWorkouts;
