import ZwiftConfigCard from '../components/profile/ZwiftConfigCard';
import IntervalsConfigCard from '../components/profile/IntervalsConfigCard';
import OpenAIConfigCard from '../components/profile/OpenAIConfigCard';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import GarminConnectCard from '../components/connections/GarminConnectCard';
import { ToggleSwitch } from '../components/profile/ConnectionCard';
import { Share2 } from 'lucide-react';

const Profile = () => {
  const { user } = useAuth();
  const [intervalsAthleteId, setIntervalsAthleteId] = useState('');
  const [hasCredentialsSaved, setHasCredentialsSaved] = useState(false);

  // Zwift initial config — the card owns the interactive state
  const [zwiftInit, setZwiftInit] = useState({ enabled: false, username: '', hasConfig: false });

  // Workout sharing state
  const [shareWorkoutsEnabled, setShareWorkoutsEnabled] = useState(false);
  const [shareWorkoutsBusy, setShareWorkoutsBusy] = useState(false);
  const [shareWorkoutsMessage, setShareWorkoutsMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await api.get('/user/me');
      if (response.data.hasIntervalsConfig || response.data.intervalsAthleteId) {
        setIntervalsAthleteId(response.data.intervalsAthleteId || '');
        setHasCredentialsSaved(true);
      }
      // Load Zwift config (the card syncs from these props)
      setZwiftInit({
        enabled: response.data.zwiftEnabled || false,
        username: response.data.zwiftUsername || '',
        hasConfig: !!response.data.hasZwiftConfig,
      });
      setShareWorkoutsEnabled(response.data.shareWorkoutsEnabled || false);
    } catch (err) {
      // Silently fail
    }
  };

  // Workout sharing handlers
  const toggleShareWorkouts = async (enabled) => {
    try {
      setShareWorkoutsBusy(true);
      setShareWorkoutsMessage({ type: '', text: '' });
      await api.put('/user/profile', { shareWorkoutsEnabled: enabled });
      setShareWorkoutsEnabled(enabled);
      const userResponse = await api.get('/user/me');
      if (userResponse.data) {
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: userResponse.data }));
      }
      setShareWorkoutsMessage({
        type: 'success',
        text: enabled ? 'Workout sharing enabled.' : 'Workout sharing disabled.'
      });
    } catch (err) {
      setShareWorkoutsMessage({ type: 'error', text: 'Failed to update sharing setting' });
    } finally {
      setShareWorkoutsBusy(false);
    }
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-gray-600 mt-1">Manage your account, connections and integrations</p>
        </div>

        {/* Intervals.icu Configuration */}
        <IntervalsConfigCard
          initialEnabled={user?.intervalsEnabled !== false}
          initialAthleteId={intervalsAthleteId}
          initialHasConfig={hasCredentialsSaved}
        />

        {/* Garmin Direct Connection */}
        <GarminConnectCard />

        {/* OpenAI Configuration */}
        <OpenAIConfigCard />

        <ZwiftConfigCard
          initialEnabled={zwiftInit.enabled}
          initialUsername={zwiftInit.username}
          initialHasConfig={zwiftInit.hasConfig}
        />

        {/* Workout Sharing Configuration */}
        <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Share2 className="h-5 w-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">Workout Sharing</h2>
          </div>
          <p className="text-gray-600 text-sm mb-6">
            Enable this to allow other users to share workouts with you, and to share workouts from the workout library or your custom workouts to other users.
          </p>

          <div className="space-y-6">
            {shareWorkoutsMessage.text && (
              <div className={`p-3 rounded-xl text-sm ${
                shareWorkoutsMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {shareWorkoutsMessage.text}
              </div>
            )}

            <div className="flex items-center gap-3">
              <ToggleSwitch
                enabled={shareWorkoutsEnabled}
                busy={shareWorkoutsBusy}
                onToggle={toggleShareWorkouts}
              />
              <span className="font-medium text-gray-900">Share/Receive Workouts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
