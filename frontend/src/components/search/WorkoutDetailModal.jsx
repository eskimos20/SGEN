import { X, Calendar } from 'lucide-react';
import { useLockBodyScroll } from '../../utils/modalScrollLock';
import WorkoutChart from '../workout/WorkoutChart';
import WorkoutZoneDistribution from '../workout/WorkoutZoneDistribution';
import WorkoutStats from '../workout/WorkoutStats';
import { getSportSettingsForType } from '../../utils/zoneUtils';
import { formatDuration } from '../../utils/dataUtils';
import { calculateWorkoutMetrics } from '../../utils/workoutUtils';
import { workKjToKcal } from '../../utils/nutritionUtils';
import { getSportEmoji } from '../../utils/sportTypeUtils';

const WorkoutDetailModal = ({
  isOpen,
  workout,
  athleteProfile,
  onClose,
  onSchedule,
  getSportType,
  getSportTypeDisplayName
}) => {
  useLockBodyScroll(isOpen);

  if (!isOpen || !workout) return null;

  const sportType = getSportType(workout);
  const sportSettings = getSportSettingsForType(
    athleteProfile?.sportSettings,
    sportType === 'run' ? 'Run' : 'Ride'
  );
  const ftp = sportType === 'run'
    ? (athleteProfile?.runningFtp || 240)
    : sportSettings.ftp;

  const durationSeconds = (workout.duration || 0) * 60;
  const metrics = workout.workout_doc ? calculateWorkoutMetrics(workout.workout_doc, ftp) : null;
  const estimatedKcal = metrics?.work ? workKjToKcal(metrics.work) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-none sm:max-w-2xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col pt-4 sm:pt-0">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getSportEmoji(sportType)}</span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{workout.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {getSportTypeDisplayName(workout)} · {workout.source === 'custom' ? 'Custom' : 'Library'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
            {durationSeconds > 0 && (
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-lg sm:text-2xl font-bold text-gray-900">
                  {formatDuration(durationSeconds)}
                </div>
                <div className="text-xs text-gray-500">Duration</div>
              </div>
            )}
            {workout.tss > 0 && (
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-lg sm:text-2xl font-bold text-gray-900">{workout.tss}</div>
                <div className="text-xs text-gray-500">Load (TSS)</div>
              </div>
            )}
            {metrics?.icu_intensity > 0 && (
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-lg sm:text-2xl font-bold text-gray-900">
                  {Math.round(metrics.icu_intensity * 100)}%
                </div>
                <div className="text-xs text-gray-500">Intensity</div>
              </div>
            )}
            {estimatedKcal > 0 && (
              <div className="bg-rose-50 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-lg sm:text-2xl font-bold text-rose-700">~{estimatedKcal}</div>
                <div className="text-xs text-rose-500">Est. kcal</div>
              </div>
            )}
          </div>

          {/* Zone Distribution */}
          {workout.workout_doc && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Zone Distribution</h3>
              <WorkoutZoneDistribution
                workoutDoc={workout.workout_doc}
                totalTime={durationSeconds}
                powerZones={sportSettings.powerZones}
              />
            </div>
          )}

          {/* Workout Profile */}
          {workout.workout_doc?.steps && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Workout Profile</h3>
              <WorkoutChart
                workoutDoc={workout.workout_doc}
                ftp={ftp}
                powerZones={sportSettings.powerZones}
                height="h-32"
                showTooltip={true}
              />
            </div>
          )}

          {/* Workout Stats */}
          {workout.workout_doc?.steps && (
            <div className="mb-6">
              <WorkoutStats workoutDoc={workout.workout_doc} ftp={ftp} />
            </div>
          )}

          {/* Description */}
          {workout.description && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
                {workout.description}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex-shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
          >
            Close
          </button>
          <button
            onClick={() => { onClose(); onSchedule(workout); }}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkoutDetailModal;
