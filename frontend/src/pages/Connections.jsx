import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { Loader2, CheckCircle, XCircle, ExternalLink, AlertTriangle } from 'lucide-react';

/**
 * Provider definitions: detection + toggleable sync options.
 * Fields map to Intervals.icu athlete profile fields (PUT /api/v1/athlete/{id}).
 * `invert: true` means the checkbox label is positive but the stored field is negative
 * (e.g. "Use Strava gear" checked -> ignore_strava_gear = false).
 */
const PROVIDERS = [
  {
    key: 'strava', name: 'Strava',
    isConnected: (a) => a.strava_authorized === true || !!a.strava_id,
    options: [
      { field: 'strava_sync_activities', label: 'Download activities' },
      { field: 'strava_sync_other_activities', label: 'Download activities uploaded by other apps' },
      { field: 'update_strava_name', label: 'Update activity name on Strava when renamed' },
      { field: 'add_weather_to_strava_descr', label: 'Add weather to activity description on Strava' },
      { field: 'ignore_strava_gear', label: 'Use gear from Strava', invert: true },
    ],
  },
  {
    key: 'garmin', name: 'Garmin Connect',
    isConnected: (a) => !!(a.icu_garmin_last_upload || a.icu_garmin_sync_activities ||
        a.icu_garmin_health || a.icu_garmin_training ||
        a.icu_garmin_download_wellness || a.icu_garmin_upload_workouts),
    options: [
      { field: 'icu_garmin_sync_activities', label: 'Download activities' },
      { field: 'icu_garmin_health', label: 'Download health data' },
      { field: 'icu_garmin_training', label: 'Download training' },
      { field: 'icu_garmin_download_wellness', label: 'Download wellness' },
      { field: 'icu_garmin_upload_workouts', label: 'Upload planned workouts' },
    ],
  },
  {
    key: 'zwift', name: 'Zwift',
    isConnected: (a) => !!a.zwift_user_id,
    options: [
      { field: 'zwift_sync_activities', label: 'Download activities' },
      { field: 'zwift_upload_workouts', label: 'Upload planned workouts' },
    ],
  },
  {
    key: 'wahoo', name: 'Wahoo',
    isConnected: (a) => !!a.wahoo_user_id,
    options: [
      { field: 'wahoo_sync_activities', label: 'Download activities' },
      { field: 'wahoo_upload_workouts', label: 'Upload planned workouts' },
    ],
  },
  {
    key: 'polar', name: 'Polar',
    isConnected: (a) => !!a.polar_scope,
    options: [
      { field: 'polar_sync_activities', label: 'Download activities' },
      { field: 'polar_download_wellness', label: 'Download wellness' },
    ],
  },
  {
    key: 'suunto', name: 'Suunto',
    isConnected: (a) => !!a.suunto_scope || !!a.suunto_user_id,
    options: [
      { field: 'suunto_sync_activities', label: 'Download activities' },
      { field: 'suunto_download_wellness', label: 'Download wellness' },
      { field: 'suunto_upload_workouts', label: 'Upload planned workouts' },
    ],
  },
  {
    key: 'coros', name: 'Coros',
    isConnected: (a) => !!a.coros_user_id,
    options: [
      { field: 'coros_sync_activities', label: 'Download activities' },
      { field: 'coros_download_wellness', label: 'Download wellness' },
      { field: 'coros_upload_workouts', label: 'Upload planned workouts' },
    ],
  },
  {
    key: 'concept2', name: 'Concept2',
    isConnected: (a) => !!a.concept2_user_id,
    options: [
      { field: 'concept2_sync_activities', label: 'Download activities' },
    ],
  },
  {
    key: 'zepp', name: 'Zepp',
    isConnected: (a) => !!a.zepp_user_id,
    options: [
      { field: 'zepp_sync_activities', label: 'Download activities' },
      { field: 'zepp_download_wellness', label: 'Download wellness' },
      { field: 'zepp_upload_workouts', label: 'Upload planned workouts' },
    ],
  },
  {
    key: 'huawei', name: 'Huawei Health',
    isConnected: (a) => !!a.huawei_user_id,
    options: [
      { field: 'huawei_sync_activities', label: 'Download activities' },
      { field: 'huawei_download_wellness', label: 'Download wellness' },
      { field: 'huawei_upload_workouts', label: 'Upload planned workouts' },
    ],
  },
  {
    key: 'oura', name: 'Oura Ring',
    isConnected: (a) => !!a.oura_scope,
    options: [],
  },
  {
    key: 'whoop', name: 'Whoop',
    isConnected: (a) => !!a.whoop_scope,
    options: [],
  },
];

const Connections = () => {
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingField, setSavingField] = useState(null);
  const [saveError, setSaveError] = useState('');

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/statistics/athlete-profile');
      setAthlete(response.data?.athlete || {});
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const isChecked = (field, invert) => {
    const value = athlete?.[field];
    if (invert) return value !== true;
    return value === true;
  };

  const handleToggle = async (field, invert, checked) => {
    const newValue = invert ? !checked : checked;
    const previousValue = athlete[field];

    // Optimistic update
    setAthlete(prev => ({ ...prev, [field]: newValue }));
    setSavingField(field);
    setSaveError('');

    try {
      await api.put('/statistics/athlete/profile', { [field]: newValue });
    } catch (err) {
      // Revert on failure
      setAthlete(prev => ({ ...prev, [field]: previousValue }));
      setSaveError(`Failed to update ${field}. Please try again.`);
    } finally {
      setSavingField(null);
    }
  };

  const connectedProviders = athlete ? PROVIDERS.filter(p => p.isConnected(athlete)) : [];
  const notConnectedProviders = athlete ? PROVIDERS.filter(p => !p.isConnected(athlete)) : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Connections</h1>
          <p className="text-gray-600 mt-1">Manage your Intervals.icu provider connections and sync settings</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-3 rounded-lg">
            {saveError}
          </div>
        )}

        {loading ? (
          <div className="card-mobile">
            <div className="text-center py-12">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-400 mb-3" />
              <p className="text-gray-500">Loading connections...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="card-mobile divide-y divide-gray-100">
              {connectedProviders.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <p>No providers connected yet.</p>
                </div>
              ) : (
                connectedProviders.map(provider => (
                  <div key={provider.key} className="p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-gray-900">{provider.name}</h2>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          <CheckCircle className="h-3 w-3" />
                          Connected
                        </span>
                      </div>
                    </div>
                    {provider.options.length === 0 ? (
                      <p className="text-sm text-gray-500">No sync options available for this provider.</p>
                    ) : (
                      <div className="space-y-2">
                        {provider.options.map(opt => {
                          const checked = isChecked(opt.field, opt.invert);
                          const saving = savingField === opt.field;
                          return (
                            <label
                              key={opt.field}
                              className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none"
                            >
                              <div
                                onClick={() => !saving && handleToggle(opt.field, opt.invert, !checked)}
                                className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                                  checked ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                                } ${saving ? 'opacity-50' : ''}`}
                              >
                                {checked && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <span className="flex-1">{opt.label}</span>
                              {saving && (
                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Strava warning when relevant */}
            {athlete?.strava_sync_activities === true && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs sm:text-sm text-amber-800">
                  Activities downloaded from Strava are masked by the Intervals.icu API and appear
                  without data in SGEN. If you also sync via Zwift/Garmin/etc., consider turning off
                  Strava "Download activities" so activities arrive with full data.
                </p>
              </div>
            )}

            {notConnectedProviders.length > 0 && (
              <div className="card-mobile">
                <div className="p-3 sm:p-4 border-b border-gray-100">
                  <h2 className="text-base font-semibold text-gray-700">Available providers</h2>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="flex flex-wrap gap-2">
                    {notConnectedProviders.map(p => (
                      <span
                        key={p.key}
                        className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5"
                      >
                        <XCircle className="h-3 w-3" />
                        {p.name}
                      </span>
                    ))}
                  </div>
                  <a
                    href="https://intervals.icu/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-sm text-primary-600 hover:text-primary-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Connect a provider on Intervals.icu
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Connections;
