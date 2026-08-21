import React, { useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import ActivityDetailsView from './ActivityDetailsView';

const ActivitiesList = ({ 
  activeTab, 
  data, 
  expandedActivities, 
  loadingDetails, 
  activityDetails, 
  athleteProfile,
  toggleActivityDetails,
  formatDuration 
}) => {
  if (activeTab !== 'overview' || !data?.activities) {
    return null;
  }

  const isStravaRestricted = useCallback((activity) => activity._strava_restricted || 
    (!activity.name && !activity.type && activity.source === 'STRAVA'), []);

  return (
    <div className="card-mobile">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 px-2 sm:px-0">Activities ({data.activities.length})</h2>
      <div className="space-y-2">
        {data.activities.map((activity) => {
          const restricted = isStravaRestricted(activity);
          return (
          <div key={activity.id} className={`border rounded-xl overflow-hidden ${restricted ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}>
            <button
              onClick={() => !restricted && toggleActivityDetails(activity.id)}
              className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${restricted ? 'cursor-default' : 'hover:bg-gray-50'}`}
            >
              <div className="flex items-center gap-4">
                <div className="text-left">
                  <div className="font-medium text-gray-900">
                    {activity.name || (restricted ? 'Strava Activity (restricted)' : 'Unknown Activity')}
                  </div>
                  <div className="text-sm text-gray-500">
                    {activity.start_date_local || activity.start_date 
                      ? format(new Date(activity.start_date_local || activity.start_date), 'MMM d, yyyy HH:mm') 
                      : 'Unknown date'} • {activity.type || (restricted ? 'Strava' : 'Unknown')}
                  </div>
                  {restricted && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Not available via API — connect your device/app directly to Intervals.icu (e.g. Zwift, Garmin, Polar, Suunto, Wahoo)</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {!restricted && (
                  <>
                    <div className="text-right text-sm">
                      <div className="text-gray-900">{formatDuration(activity.moving_time)}</div>
                      <div className="text-gray-500">{activity.icu_training_load ? `TSS: ${Math.round(activity.icu_training_load)}` : ''}</div>
                    </div>
                    {expandedActivities.has(activity.id) ? (
                      <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </>
                )}
              </div>
            </button>
            
            {!restricted && expandedActivities.has(activity.id) && (
              <div className="pb-4 bg-gray-50">
                {loadingDetails.has(activity.id) ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                    <span className="ml-2 text-gray-600">Loading details...</span>
                  </div>
                ) : activityDetails[activity.id]?.incomplete ? (
                  <div className="py-4 text-center text-amber-700 bg-amber-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
                    <p className="font-medium">Activity data not available</p>
                    <p className="text-sm mt-1">{activityDetails[activity.id].incompleteReason || 'This activity has not been fully synced in Intervals.icu'}</p>
                    <p className="text-xs mt-2 text-amber-600">Connect your device/app directly to Intervals.icu to resolve this (e.g. Zwift, Garmin, Polar, Suunto, Wahoo).</p>
                  </div>
                ) : activityDetails[activity.id] ? (
                  <ActivityDetailsView 
                    details={activityDetails[activity.id]} 
                    activity={activity}
                    formatDuration={formatDuration}
                    athleteProfile={athleteProfile}
                    stravaData={activityDetails[activity.id]?.stravaData}
                  />
                ) : (
                  <div className="py-4 text-center text-gray-500">
                    Failed to load activity details
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
};

export default React.memo(ActivitiesList);
