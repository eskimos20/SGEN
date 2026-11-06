import React from 'react';
import { BarChart2, ChevronUp, ChevronDown, Activity, Clock, TrendingUp, Zap } from 'lucide-react';
import { formatHoursMinutes } from '../../utils/dataUtils';

/**
 * Overview stats card on the Statistics page — activity count, total time,
 * distance and training load for the searched period. Collapsible via the
 * shared persisted preference in the page.
 */
const StatsOverviewCard = ({ stats, expanded, onToggle }) => (
  <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
    <div
      className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity mb-4"
      onClick={onToggle}
    >
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <BarChart2 className="h-5 w-5 text-blue-600" />
        Activities, Time, Distance & Training Load
      </h2>
      {expanded ? <ChevronUp className="h-5 w-5 text-gray-600" /> : <ChevronDown className="h-5 w-5 text-gray-600" />}
    </div>
    {expanded && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
          <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-primary-600 mx-auto mb-2" />
          <div className="text-lg sm:text-2xl font-bold text-gray-900">{stats.totalActivities}</div>
          <div className="text-xs sm:text-sm text-gray-600">Activities</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
          <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 mx-auto mb-2" />
          <div className="text-lg sm:text-2xl font-bold text-gray-900">{formatHoursMinutes(stats.totalTime)}</div>
          <div className="text-xs sm:text-sm text-gray-600">Total Time</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
          <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 mx-auto mb-2" />
          <div className="text-lg sm:text-2xl font-bold text-gray-900">{Math.round(stats.totalDistance / 1000)}km</div>
          <div className="text-xs sm:text-sm text-gray-600">Distance</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
          <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-amber-600 mx-auto mb-2" />
          <div className="text-lg sm:text-2xl font-bold text-gray-900">{Math.round(stats.totalLoad)}</div>
          <div className="text-xs sm:text-sm text-gray-600">Training Load</div>
        </div>
      </div>
    )}
  </div>
);

export default React.memo(StatsOverviewCard);
