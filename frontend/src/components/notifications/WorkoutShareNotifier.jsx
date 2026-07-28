import { useState, useEffect, useCallback } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import api from '../../api/axios';
import WorkoutChart from '../workout/WorkoutChart';
import { getSportEmoji } from '../../utils/sportTypeUtils';

const WorkoutShareNotifier = () => {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [athleteProfile, setAthleteProfile] = useState(null);

  useEffect(() => {
    const fetchShares = async () => {
      try {
        const response = await api.get('/workout-shares/pending');
        setShares(response.data.shares || []);
      } catch (err) {
        console.error('Failed to fetch shared workouts:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchAthleteProfile = async () => {
      try {
        const response = await api.get('/statistics/athlete-profile');
        setAthleteProfile(response.data);
      } catch (err) {
        console.error('Failed to fetch athlete profile:', err);
      }
    };

    fetchShares();
    fetchAthleteProfile();
    const interval = setInterval(fetchShares, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSportType = useCallback((share) => {
    return share.sportType ||
           share.workout_doc?.sport_type ||
           share.workout_doc?.sportType ||
           share.sport_type ||
           'bike';
  }, []);

  const getSportTypeDisplayName = useCallback((share) => {
    const sportType = getSportType(share);
    return sportType === 'bike' ? 'Cycling' :
           sportType === 'run' ? 'Running' :
           sportType.charAt(0).toUpperCase() + sportType.slice(1);
  }, [getSportType]);

  const getFtpForShare = useCallback((share) => {
    try {
      const sportSettings = athleteProfile?.sportSettings;
      if (!sportSettings || !Array.isArray(sportSettings)) {
        return getSportType(share) === 'run' ? 240 : 280;
      }

      const sportKey = getSportType(share) === 'run' ? 'Run' : 'Ride';
      const sportSetting = sportSettings.find(setting =>
        setting.types && setting.types.some(type => type === sportKey)
      );

      if (sportSetting && sportSetting.ftp) {
        return sportSetting.ftp;
      }
      return sportKey === 'Run' ? 240 : 280;
    } catch {
      return getSportType(share) === 'run' ? 240 : 280;
    }
  }, [athleteProfile, getSportType]);

  const handleAccept = async (share) => {
    setProcessing(prev => ({ ...prev, [share.id]: 'accept' }));
    try {
      await api.post(`/workout-shares/${share.id}/accept`);
      setShares(prev => prev.filter(s => s.id !== share.id));
    } catch (err) {
      console.error('Failed to accept share:', err);
      alert(err.response?.data?.error || 'Failed to accept workout');
    } finally {
      setProcessing(prev => ({ ...prev, [share.id]: null }));
    }
  };

  const handleDecline = async (share) => {
    setProcessing(prev => ({ ...prev, [share.id]: 'decline' }));
    try {
      await api.post(`/workout-shares/${share.id}/decline`);
      setShares(prev => prev.filter(s => s.id !== share.id));
    } catch (err) {
      console.error('Failed to decline share:', err);
      alert(err.response?.data?.error || 'Failed to decline workout');
    } finally {
      setProcessing(prev => ({ ...prev, [share.id]: null }));
    }
  };

  if (loading || shares.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-40 w-full max-w-sm space-y-3">
      {shares.map(share => (
        <div
          key={share.id}
          className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl shadow-2xl p-4"
        >
          <div className="mb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg" title={getSportTypeDisplayName(share)}>
                    {getSportEmoji(getSportType(share))}
                  </span>
                  <h3 className="font-semibold text-white truncate">{share.workoutName}</h3>
                </div>
                <p className="text-xs text-white/90">
                  Shared by {share.fromUsername}
                  <span className="text-white/70"> · TSS {share.tss ?? '-'}</span>
                  <span className="text-white/70"> · {share.duration ?? '-'}min</span>
                </p>
              </div>
            </div>
          </div>

          {share.workout_doc?.steps && (
            <div className="mb-3">
              <WorkoutChart
                workoutDoc={share.workout_doc}
                height="h-20"
                ftp={getFtpForShare(share)}
                showTooltip={true}
              />
            </div>
          )}

          {share.description && (
            <p className="text-xs text-white/80 mb-3">
              {share.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => handleAccept(share)}
              disabled={processing[share.id]}
              className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {processing[share.id] === 'accept' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Accept
            </button>
            <button
              onClick={() => handleDecline(share)}
              disabled={processing[share.id]}
              className="flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {processing[share.id] === 'decline' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WorkoutShareNotifier;
