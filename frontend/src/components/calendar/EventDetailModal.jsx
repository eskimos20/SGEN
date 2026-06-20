import { useState, useEffect, useRef } from 'react';
import { Activity, X, Loader2, Trash2, Edit, Utensils } from 'lucide-react';
import api from '../../api/axios';
import { useLockBodyScroll } from '../../utils/modalScrollLock';
import WorkoutChart from '../workout/WorkoutChart';
import WorkoutZoneDistribution from '../workout/WorkoutZoneDistribution';
import WorkoutStats from '../workout/WorkoutStats';
import ActivityDetailsView from '../activities/ActivityDetailsView';
import FindIntervalsPanel from '../activities/FindIntervalsPanel';
import AddCalendarEntryModal from './AddCalendarEntryModal';
import { getSportSettingsForType } from '../../utils/zoneUtils';
import { formatDuration } from '../../utils/dataUtils';
import { extractTSSFromName, calculateWorkoutMetrics, parseWorkoutName } from '../../utils/workoutUtils';
import { workKjToKcal } from '../../utils/nutritionUtils';

const EventDetailModal = ({
  selectedEvent,
  activityDetails,
  detailsLoading,
  stravaData,
  stravaLoading,
  athleteProfile,
  isDeleting,
  onClose,
  onDeleteEvent,
  setActivities,
  setSelectedEvent,
  setActivityDetails,
  setDetailsLoading,
  onIntervalsApplied
}) => {
  // Categories that are editable events (not workouts)
  const editableEventCategories = ['SICK', 'NOTE', 'HOLIDAY', 'INJURED', 'RACE_A', 'RACE_B', 'RACE_C', 'SEASON_START', 'WELLNESS'];
  
  const [isEditing, setIsEditing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRpe, setEditRpe] = useState(null);
  const [editFeel, setEditFeel] = useState(null);
  const [editLoad, setEditLoad] = useState(null);
  const [editGearId, setEditGearId] = useState(null);
  const [gear, setGear] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const contentRef = useRef(null);
  const findIntervalsRef = useRef(null);

  // Fetch gear list
  useEffect(() => {
    const fetchGear = async () => {
      try {
        const response = await api.get('/statistics/gear');
        // Filter out retired gear
        const activeGear = (response.data || []).filter(g => !g.retired);
        setGear(activeGear);
      } catch (err) {
        console.error('Failed to load gear:', err);
      }
    };
    fetchGear();
  }, []);

  // Prevent pull-to-refresh at document level when modal is open
  useEffect(() => {
    if (!selectedEvent) return;

    let touchStartY = 0;

    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;
      const scrollEl = contentRef.current;

      // If scrolling down (pull-to-refresh gesture) and content is at top, prevent it
      if (deltaY > 0 && scrollEl && scrollEl.scrollTop <= 0) {
        e.preventDefault();
      }
      // If scrolling up and content is at bottom, prevent overscroll
      if (deltaY < 0 && scrollEl && scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Also prevent body scroll while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedEvent]);

  const startEditing = () => {
    if (selectedEvent.isCompleted) {
      // For completed activities, use the simple edit form
      setEditName(selectedEvent.name || '');
      setEditDescription(selectedEvent.description || '');
      setEditRpe(selectedEvent.icu_rpe || null);
      setEditFeel(selectedEvent.feel || null);
      setEditLoad(selectedEvent.icu_training_load || null);
      // Gear is stored as an object with id field
      setEditGearId(selectedEvent.gear?.id || '');
      setIsEditing(true);
    } else {
      // For custom events (SICK, HOLIDAY, etc.), open the full edit modal
      setShowEditModal(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    findIntervalsRef.current?.clearEfforts();
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      const feedback = {};
      if (editName !== selectedEvent.name) feedback.name = editName;
      if (editRpe !== null) feedback.icu_rpe = editRpe;
      if (editFeel !== null) feedback.feel = editFeel;
      if (editLoad !== null) feedback.icu_training_load = editLoad;
      if (editDescription !== (selectedEvent.description || '')) feedback.description = editDescription;

      // Different API endpoints for completed activities vs planned events
      if (selectedEvent.isCompleted) {
        // Persist to backend for completed activities
        await api.put(`/statistics/activity/${selectedEvent.id}/feedback`, feedback);
        
        // Update gear if changed
        if (editGearId && editGearId !== selectedEvent.gear?.id) {
          await api.put(`/statistics/activity/${selectedEvent.id}/gear`, { gearId: editGearId });
          // Update gear object in feedback
          feedback.gear = { id: editGearId };
        }
      } else {
        // Update planned event via intervals.icu
        await api.put(`/statistics/calendar/events/${selectedEvent.id}`, feedback);
      }

      // Update local state after successful save
      const updatedEvent = { ...selectedEvent, ...feedback };
      if (setActivities) {
        setActivities(prev => prev.map(a => 
          a.id === selectedEvent.id ? updatedEvent : a
        ));
      }
      if (setSelectedEvent) {
        setSelectedEvent(updatedEvent);
      }

      // Apply pending intervals if any
      const pendingIntervals = findIntervalsRef.current?.getPendingPayload();
      if (pendingIntervals) {
        // Get search duration from FindIntervalsPanel
        const searchDuration = findIntervalsRef.current?.getSearchDuration();
        const params = searchDuration ? { searchDuration } : {};
        
        const intervalResponse = await api.put(`/statistics/activity/${selectedEvent.id}/intervals`, pendingIntervals, { params });
        findIntervalsRef.current?.clearEfforts();

        // Update activityDetails locally with the response (contains all intervals including RECOVERY)
        if (setActivityDetails && intervalResponse.data) {
          setActivityDetails(prev => ({
            ...prev,
            intervals: {
              ...(prev?.intervals || {}),
              icu_intervals: Array.isArray(intervalResponse.data) ? intervalResponse.data : (intervalResponse.data.icu_intervals || prev?.intervals?.icu_intervals)
            }
          }));
        }
      }

      // Exit editing mode (stay in modal)
      setIsEditing(false);

      // Refresh calendar data in background
      if (onIntervalsApplied) {
        onIntervalsApplied();
      }
    } catch (err) {
      console.error('Failed to save changes:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Lock background scroll when modal is open
  useLockBodyScroll(!!selectedEvent);

  if (!selectedEvent) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl rounded-xl shadow-2xl w-full max-w-none sm:max-w-4xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col pt-4 sm:pt-0" style={{ overscrollBehavior: 'contain' }}>
        {/* Modal Header */}
        <div className="border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 text-primary-600" />
              <div>
                {(() => {
                  const { mainName, shortDescription } = parseWorkoutName(selectedEvent.name);
                  return (
                    <>
                      <h2 className="text-xl font-bold text-gray-900">{mainName}</h2>
                      {shortDescription && (
                        <p className="text-sm text-gray-600 font-medium mt-1">{shortDescription}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-2">
                        {new Date(selectedEvent.start_date_local).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Edit button - only for completed activities AND custom events (SICK, HOLIDAY, NOTE, etc.) */}
              {(selectedEvent.isCompleted || (!selectedEvent.isCompleted && selectedEvent.category && editableEventCategories.includes(selectedEvent.category))) && (
                <button
                  onClick={() => isEditing ? cancelEditing() : startEditing()}
                  className={`p-2 rounded-lg transition-colors ${isEditing ? 'bg-blue-100 text-blue-700' : 'hover:bg-blue-100 text-blue-600'}`}
                  title={isEditing ? 'Cancel editing' : (selectedEvent.isCompleted ? 'Edit activity' : 'Edit event')}
                >
                  <Edit className="h-5 w-5" />
                </button>
              )}
              {/* Delete button */}
              <button
                onClick={onDeleteEvent}
                disabled={isDeleting}
                className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors disabled:opacity-50"
                title="Delete workout"
              >
                {isDeleting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Trash2 className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Content */}
        <div ref={contentRef} className="p-4 overflow-y-auto flex-1" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {/* Edit Section - only for completed activities AND custom events */}
          {(selectedEvent.isCompleted || (!selectedEvent.isCompleted && selectedEvent.category && editableEventCategories.includes(selectedEvent.category))) && isEditing && (
            <div className="mb-6 space-y-3 border border-blue-200 rounded-lg p-3 sm:p-4 bg-blue-50 overflow-hidden">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Activity Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  style={{ fontSize: '16px' }}
                />
              </div>

              {/* RPE */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">RPE (Rate of Perceived Exertion)</label>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
                  {[
                    { value: 1, bg: 'bg-emerald-500', ring: 'ring-emerald-300', label: 'Very light - Barely any effort' },
                    { value: 2, bg: 'bg-emerald-400', ring: 'ring-emerald-200', label: 'Light - Easy breathing' },
                    { value: 3, bg: 'bg-green-400', ring: 'ring-green-200', label: 'Moderate - Comfortable pace' },
                    { value: 4, bg: 'bg-lime-400', ring: 'ring-lime-200', label: 'Somewhat hard - Slightly challenging' },
                    { value: 5, bg: 'bg-yellow-400', ring: 'ring-yellow-200', label: 'Hard - Difficult to maintain' },
                    { value: 6, bg: 'bg-amber-400', ring: 'ring-amber-200', label: 'Harder - Heavy breathing' },
                    { value: 7, bg: 'bg-orange-400', ring: 'ring-orange-200', label: 'Very hard - Very challenging' },
                    { value: 8, bg: 'bg-orange-500', ring: 'ring-orange-300', label: 'Extremely hard - Struggling' },
                    { value: 9, bg: 'bg-red-500', ring: 'ring-red-300', label: 'Near max - Almost all out' },
                    { value: 10, bg: 'bg-red-600', ring: 'ring-red-300', label: 'Maximum effort - All out' }
                  ].map(({ value, bg, ring, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditRpe(value);
                      }}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all touch-manipulation ${
                        editRpe === value
                          ? `${bg} text-white ring-2 ${ring} scale-110 shadow-sm`
                          : `${bg} text-white opacity-60 hover:opacity-80`
                      }`}
                      title={label}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feel */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">How did you feel?</label>
                <div className="flex gap-1.5">
                  {[
                    { value: 1, emoji: '💪', label: 'Strong', bg: 'bg-purple-500', ring: 'ring-purple-300' },
                    { value: 2, emoji: '😊', label: 'Good', bg: 'bg-green-500', ring: 'ring-green-300' },
                    { value: 3, emoji: '😐', label: 'Normal', bg: 'bg-yellow-500', ring: 'ring-yellow-300' },
                    { value: 4, emoji: '😕', label: 'Poor', bg: 'bg-orange-500', ring: 'ring-orange-300' },
                    { value: 5, emoji: '😩', label: 'Weak', bg: 'bg-red-500', ring: 'ring-red-300' }
                  ].map(({ value, emoji, label, bg, ring }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditFeel(value);
                      }}
                      className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-0.5 transition-all touch-manipulation ${
                        editFeel === value
                          ? `${bg} text-white ring-2 ${ring} scale-[1.03] shadow-sm`
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={label}
                    >
                      <span className="text-base">{emoji}</span>
                      <span className={`text-[10px] font-medium ${editFeel === value ? 'text-white/90' : 'text-gray-500'}`}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Gear Selection */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Gear</label>
                <select
                  value={editGearId || ''}
                  onChange={(e) => setEditGearId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  style={{ fontSize: '16px' }}
                >
                  <option value="">No gear selected</option>
                  {gear.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.type}) - {((item.distance || 0) / 1000).toFixed(0)} km
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add notes about this activity..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none bg-white"
                  style={{ fontSize: '16px' }}
                  rows={2}
                />
              </div>

              {/* Load (TSS) */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Load (TSS)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editLoad || ''}
                    onChange={(e) => setEditLoad(e.target.value ? Number(e.target.value) : null)}
                    placeholder="Load"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    style={{ fontSize: '16px' }}
                    min="0"
                    max="9999"
                  />
                  <p className="text-xs text-amber-600 italic">Only adjust if incorrect</p>
                </div>
              </div>

              {/* Find Intervals */}
              {activityDetails?.streams && (
                <FindIntervalsPanel
                  ref={findIntervalsRef}
                  activityId={selectedEvent.id}
                  streams={activityDetails.streams}
                />
              )}
            </div>
          )}
          {/* Stats Row - only for planned events */}
          {!selectedEvent.isCompleted && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
              {/* Duration - only show if moving_time exists and > 0 */}
              {selectedEvent.moving_time && selectedEvent.moving_time > 0 && (
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-gray-900">
                    {formatDuration(selectedEvent.moving_time)}
                  </div>
                  <div className="text-xs text-gray-500">Duration</div>
                </div>
              )}
              {/* Load - only show if TSS exists */}
              {(extractTSSFromName(selectedEvent.name) || selectedEvent.icu_training_load) && (
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-gray-900">
                    {extractTSSFromName(selectedEvent.name) || selectedEvent.icu_training_load || '-'}
                  </div>
                  <div className="text-xs text-gray-500">Load</div>
                </div>
              )}
              {/* Intensity - only show if intensity exists */}
              {selectedEvent.icu_intensity && (
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-gray-900">
                    {selectedEvent.icu_intensity > 2 ? Math.round(selectedEvent.icu_intensity) : Math.round(selectedEvent.icu_intensity * 100)}%
                  </div>
                  <div className="text-xs text-gray-500">Intensity</div>
                </div>
              )}
              {/* Estimated kcal from workout kJ */}
              {selectedEvent.workout_doc?.steps && (() => {
                const activityType = selectedEvent.workout_doc?.sport_type || selectedEvent.activityType || selectedEvent.sport_type || selectedEvent.type || 'Ride';
                const sportSettings = getSportSettingsForType(
                  athleteProfile?.sportSettings,
                  activityType
                );
                const metrics = calculateWorkoutMetrics(selectedEvent.workout_doc, sportSettings.ftp);
                const estimatedKcal = metrics?.work ? workKjToKcal(metrics.work) : 0;
                return estimatedKcal > 0 ? (
                  <div className="bg-rose-50 rounded-lg p-2 sm:p-3 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-rose-700">
                      ~{estimatedKcal}
                    </div>
                    <div className="text-xs text-rose-500">Est. kcal</div>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Zone Distribution - for planned events */}
          {!selectedEvent.isCompleted && selectedEvent.workout_doc && (() => {
            const sportSettings = getSportSettingsForType(
              athleteProfile?.sportSettings,
              selectedEvent.type || 'Ride'
            );
            return (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Zone Distribution</h3>
                <WorkoutZoneDistribution 
                  workoutDoc={selectedEvent.workout_doc} 
                  totalTime={selectedEvent.moving_time}
                  powerZones={sportSettings.powerZones}
                />
              </div>
            );
          })()}

          {/* Workout Profile - for planned events */}
          {!selectedEvent.isCompleted && selectedEvent.workout_doc?.steps && (() => {
            const sportSettings = getSportSettingsForType(
              athleteProfile?.sportSettings,
              selectedEvent.type || 'Ride'
            );
            // Use same activity type detection as WorkoutItemCard
            const activityType = selectedEvent.workout_doc?.sport_type || selectedEvent.activityType || selectedEvent.sport_type || selectedEvent.type || 'Cycling';
            const ftp = (activityType === 'Running' || activityType === 'Run' || activityType === 'run') 
              ? (athleteProfile?.runningFtp || 240) 
              : sportSettings.ftp;
            return (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Workout Profile</h3>
                <WorkoutChart 
                  workoutDoc={selectedEvent.workout_doc} 
                  ftp={ftp}
                  powerZones={sportSettings.powerZones}
                  height="h-32"
                  showTooltip={true}
                />
              </div>
            );
          })()}

          {/* Workout Stats - for planned events */}
          {!selectedEvent.isCompleted && selectedEvent.workout_doc?.steps && (() => {
            const sportSettings = getSportSettingsForType(
              athleteProfile?.sportSettings,
              selectedEvent.type || 'Ride'
            );
            // Use same activity type detection as WorkoutItemCard
            const activityType = selectedEvent.workout_doc?.sport_type || selectedEvent.activityType || selectedEvent.sport_type || selectedEvent.type || 'Cycling';
            const ftp = (activityType === 'Running' || activityType === 'Run' || activityType === 'run') 
              ? (athleteProfile?.runningFtp || 240) 
              : sportSettings.ftp;
            return (
              <div className="mb-6">
                <WorkoutStats workoutDoc={selectedEvent.workout_doc} ftp={ftp} />
              </div>
            );
          })()}

          {/* Activity Details - for completed activities */}
          {selectedEvent.isCompleted && !isEditing && (
            <div className="mb-6">
              {detailsLoading ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-6 w-6 animate-spin text-green-600" />
                    <span className="ml-2 text-sm text-gray-500">Loading activity data...</span>
                  </div>
                </div>
              ) : activityDetails?.incomplete ? (
                <div className="bg-amber-50 rounded-lg p-4 text-center">
                  <div className="text-amber-700">
                    <p className="font-medium">Activity data not available</p>
                    <p className="text-sm mt-1">{activityDetails.incompleteReason || 'This activity has not been fully synced in Intervals.icu'}</p>
                    <p className="text-xs mt-2 text-amber-600">Connect your device/app directly to Intervals.icu to resolve this (e.g. Zwift, Garmin, Polar, Suunto, Wahoo).</p>
                  </div>
                </div>
              ) : (detailsLoading || stravaLoading) ? (
                <div className="bg-gray-50 rounded-lg p-8">
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                    <p className="text-sm">Loading activity data...</p>
                    {stravaLoading && <p className="text-xs text-gray-400 mt-1">Fetching Strava data...</p>}
                  </div>
                </div>
              ) : activityDetails ? (
                <ActivityDetailsView 
                  details={activityDetails}
                  activity={selectedEvent}
                  formatDuration={formatDuration}
                  athleteProfile={athleteProfile}
                  stravaData={stravaData}
                />
              ) : (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
                    No activity data available
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description - only for planned events */}
          {!selectedEvent.isCompleted && selectedEvent.description && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
                {selectedEvent.description}
              </div>
            </div>
          )}

        </div>

        {/* Sticky footer - Save/Cancel */}
        {(selectedEvent.isCompleted || (!selectedEvent.isCompleted && selectedEvent.category && editableEventCategories.includes(selectedEvent.category))) && isEditing && (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex-shrink-0 flex items-center justify-end gap-2">
            <button
              onClick={cancelEditing}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveChanges}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : 'Save'}
            </button>
          </div>
        )}
      </div>
      
      {/* Edit Modal for Custom Events */}
      {showEditModal && (
        <AddCalendarEntryModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onCreated={() => {
            setShowEditModal(false);
            // Refresh calendar data after edit
            if (onIntervalsApplied) {
              onIntervalsApplied();
            }
          }}
          entryType={{ category: selectedEvent.category }}
          editEvent={selectedEvent}
          athleteProfile={athleteProfile}
        />
      )}
    </div>
  );
};

export default EventDetailModal;
