import React from 'react';
import { formatDuration } from '../../utils/dataUtils';
import { extractTSSFromName } from '../../utils/workoutUtils';
import { getSportSettingsForType, isIndoorActivity } from '../../utils/zoneUtils';
import { calculateWorkoutMetrics } from '../../utils/workoutUtils';
import { workKjToKcal } from '../../utils/nutritionUtils';

/**
 * Stats grid for a planned (not completed) calendar event — duration, load,
 * intensity and estimated kcal. Presentational; all data arrives via props.
 */
const PlannedEventStats = ({ selectedEvent, athleteProfile }) => (
  !selectedEvent.isCompleted && (
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
        const metrics = calculateWorkoutMetrics(selectedEvent.workout_doc, isIndoorActivity(selectedEvent) ? sportSettings.indoorFtp : sportSettings.ftp);
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
  )
);

export default React.memo(PlannedEventStats);
