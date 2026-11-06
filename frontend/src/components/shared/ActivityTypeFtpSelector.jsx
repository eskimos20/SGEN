import React from 'react';
import { Settings } from 'lucide-react';

/**
 * Activity type + indoor/outdoor FTP source picker with FTP status badge.
 * Presentational — all state stays in the TrainingPlanConfig parent.
 */
const ActivityTypeFtpSelector = ({ config, setConfig, getFtpStatus, cyclingFtpStatus, runningFtpStatus, ftpStatus }) => (
  <div>
    <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
      <Settings className="h-5 w-5 text-blue-600" />
      Activity Type
    </h3>
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Activity Type
        </label>
        <select
          value={config.activityType}
          onChange={(e) => {
            const selected = e.target.value;
            const status = getFtpStatus(selected);
            if (!status.hasFtp) return;
            setConfig(prev => ({ ...prev, activityType: selected }));
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium text-sm"
        >
          <option value="Cycling" disabled={!cyclingFtpStatus.hasFtp}>
            🚴‍♂️ Cycling{!cyclingFtpStatus.hasFtp ? ' (No FTP)' : ''}
          </option>
          <option value="Running" disabled={!runningFtpStatus.hasFtp}>
            🏃‍♂️ Running{!runningFtpStatus.hasFtp ? ' (No FTP)' : ''}
          </option>
        </select>
      </div>

      {/* Indoor / Outdoor FTP choice */}
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          FTP Source
        </label>
        <div className="flex rounded-lg overflow-hidden border border-gray-300">
          <button
            type="button"
            onClick={() => setConfig(prev => ({ ...prev, indoor: false }))}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              !config.indoor
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            🌳 Outdoor
          </button>
          <button
            type="button"
            onClick={() => setConfig(prev => ({ ...prev, indoor: true }))}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              config.indoor
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
            title={!ftpStatus.hasIndoorFtp ? 'No Indoor FTP set – falls back to regular FTP' : ''}
          >
            🏠 Indoor
          </button>
        </div>
      </div>

      {/* FTP Status */}
      <div className="flex-shrink-0 w-full sm:w-auto sm:self-end">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {ftpStatus.hasFtp ? (
            <div className="w-full px-3 py-1.5 rounded-lg text-sm font-medium bg-green-100 text-green-800 border border-green-200">
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <span className="font-semibold">{config.indoor ? 'Indoor FTP' : 'FTP'}: {ftpStatus.ftp}</span>
                <span className="text-xs">From your settings</span>
              </div>
            </div>
          ) : (
            <div className="w-full px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-800 border border-red-200">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="font-semibold">No FTP</span>
                <span className="text-xs">Set FTP in your profile to generate workouts</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);

export default React.memo(ActivityTypeFtpSelector);
