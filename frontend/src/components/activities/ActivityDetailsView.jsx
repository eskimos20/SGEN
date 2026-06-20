import { useState, useEffect, useRef } from 'react';
import { Activity, Heart, Zap, Clock, TrendingUp, Gauge, Timer, Flame, Target, MapPin, Trophy, Bike, Footprints, Mountain, RotateCcw, Route, Utensils, Scale } from 'lucide-react';
import { getActivityKcal } from '../../utils/nutritionUtils';
import ActivityChart from './ActivityChart';
import ActivityMap from './ActivityMap';
import ActivityPowerCurve from './ActivityPowerCurve';
import PaceCurveChart from '../charts/PaceCurveChart';
import StravaMedia from './StravaMedia';
import StravaSegments from './StravaSegments';

const RATE_LIMIT_KEY = 'strava_rate_limit_expiry';

const StravaRateLimitBanner = ({ retryAfterSeconds }) => {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (retryAfterSeconds > 0) {
      const expiry = Date.now() + retryAfterSeconds * 1000;
      localStorage.setItem(RATE_LIMIT_KEY, String(expiry));
    }

    const calcLeft = () => {
      const stored = localStorage.getItem(RATE_LIMIT_KEY);
      if (!stored) return 0;
      const left = Math.max(0, Math.ceil((Number(stored) - Date.now()) / 1000));
      return left;
    };

    const left = calcLeft();
    setSecondsLeft(left);
    if (left <= 0) return;

    intervalRef.current = setInterval(() => {
      const remaining = calcLeft();
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(intervalRef.current);
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [retryAfterSeconds]);

  if (secondsLeft === null || secondsLeft <= 0) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-3 mb-3">
      <Timer className="h-5 w-5 text-orange-500 flex-shrink-0" />
      <div className="text-sm text-orange-700">
        <p className="font-medium">Strava API rate limit reached</p>
        <p className="text-orange-600">
          Available again in {mins > 0 ? `${mins} min ` : ''}{secs} sec
        </p>
      </div>
    </div>
  );
};

const Tooltip = ({ text, children }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-block w-full" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none text-left leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
};

const ActivityDetailsView = ({ details, activity, formatDuration, athleteProfile, stravaData, stravaLoading }) => {
  const activityData = details.activity || {};
  const intervalsData = details.intervals || {};
  const allIntervals = intervalsData.icu_intervals || [];
  const streams = details.streams || [];
  const mapData = details.mapData || {};
  const achievements = activityData.icu_achievements || [];
  const powerCurve = details.powerCurve || null;
  const paceCurve = details.paceCurve || null;
  
  const activityId = activity?.id;
  const hasMap = mapData.latlngs && mapData.latlngs.length > 0;

  const sportSettings = athleteProfile?.athlete?.sportSettings?.[0] || {};
  const ftp = sportSettings.ftp || athleteProfile?.athlete?.ftp;

  // Determine if this is a running activity
  const activityType = activityData.type || activity?.type || '';
  const isRunning = activityType && (
    activityType.toLowerCase().includes('run') ||
    activityType.toLowerCase().includes('trail') ||
    activityType.toLowerCase().includes('hike') ||
    activityType.toLowerCase() === 'virtualrun'
  );

  // Calculate max cadence from intervals (since it's not in the activity object)
  const maxCadenceFromIntervals = Array.isArray(allIntervals) && allIntervals.length > 0
    ? Math.max(...allIntervals.map(i => i.max_cadence || 0).filter(c => c > 0))
    : 0;

  // Format pace as min:sec per km
  // intervals.icu stores pace as m/s (meters per second), need to convert to min/km
  const formatPace = (paceMetersPerSecond) => {
    if (!paceMetersPerSecond || paceMetersPerSecond <= 0) return null;
    // Convert m/s to seconds per km: 1000m / (m/s) = seconds per km
    const secondsPerKm = 1000 / paceMetersPerSecond;
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.round(secondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get pace (intervals.icu stores pace as m/s)
  const paceValue = activityData.pace;

  const workIntervals = Array.isArray(allIntervals) 
    ? allIntervals.filter(i => i.type === 'WORK')
    : [];
  const restIntervals = Array.isArray(allIntervals) 
    ? allIntervals.filter(i => i.type === 'RECOVERY' || i.type === 'REST')
    : [];

  const getHRRecoveryForRest = (restIdx) => {
    const restInterval = restIntervals[restIdx];
    const restIdxInAll = allIntervals.indexOf(restInterval);
    if (restIdxInAll <= 0) return null;
    
    const prevInterval = allIntervals[restIdxInAll - 1];
    if (prevInterval.type !== 'WORK') return null;
    
    if (!streams) return null;
    
    // Handle both array format [{type: 'heartrate', data: [...]}, ...]
    // and object format {heartrate: [...], time: [...]}
    let hrData = null;
    let timeData = null;
    
    if (Array.isArray(streams)) {
      // Array format
      const hrStream = streams.find(s => s.type === 'heartrate');
      const timeStream = streams.find(s => s.type === 'time');
      hrData = hrStream?.data || null;
      timeData = timeStream?.data || null;
    } else if (typeof streams === 'object') {
      // Object format - direct arrays or wrapped in data property
      hrData = Array.isArray(streams.heartrate) ? streams.heartrate : (streams.heartrate?.data || null);
      timeData = Array.isArray(streams.time) ? streams.time : (streams.time?.data || null);
    }
    
    if (!hrData || !timeData || hrData.length === 0 || timeData.length === 0) return null;
    
    const restStartTime = prevInterval.end_index !== undefined && prevInterval.end_index < timeData.length
      ? timeData[prevInterval.end_index]
      : (restInterval.start_index !== undefined && restInterval.start_index < timeData.length
          ? timeData[restInterval.start_index]
          : null);
    
    if (restStartTime === null) return null;
    
    const endWinStart = Math.max(0, restStartTime - 10);
    const endWinEnd = restStartTime;
    
    let hrAtEndSum = 0;
    let hrAtEndCount = 0;
    
    for (let i = 0; i < timeData.length; i++) {
      const t = timeData[i];
      if (t >= endWinStart && t <= endWinEnd && hrData[i] > 0) {
        hrAtEndSum += hrData[i];
        hrAtEndCount++;
      }
    }
    
    if (hrAtEndCount === 0) return null;
    const hrAtEnd = hrAtEndSum / hrAtEndCount;
    
    const HRR_MEASUREMENT_SECONDS = 60;
    const recoveryCenter = restStartTime + HRR_MEASUREMENT_SECONDS;
    const window = 5.0;
    const recWinStart = recoveryCenter - window / 2.0;
    const recWinEnd = recoveryCenter + window / 2.0;
    
    let hrAfterSum = 0;
    let hrAfterCount = 0;
    
    for (let i = 0; i < timeData.length; i++) {
      const t = timeData[i];
      if (t >= recWinStart && t <= recWinEnd && hrData[i] > 0) {
        hrAfterSum += hrData[i];
        hrAfterCount++;
      }
    }
    
    if (hrAfterCount === 0) return null;
    const hrAfterRecovery = hrAfterSum / hrAfterCount;
    
    const hrr = hrAtEnd - hrAfterRecovery;
    return hrr > 0 ? Math.round(hrr) : null;
  };

  const hrDrift = activityData.decoupling;

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Activity Link */}
      {activityId && (
        <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Bike className="h-5 w-5 text-blue-600" />
            <span className="text-sm text-blue-800">View full activity details</span>
          </div>
          <a 
            href={`https://intervals.icu/activities/${activityId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            View on Intervals.icu →
          </a>
        </div>
      )}

      {/* Route Map - Full Width */}
      {hasMap && (
        <div className="bg-white sm:rounded-lg sm:shadow-sm p-2 sm:p-3">
          <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Route Map
            {activityData.distance > 0 && (
              <span className="text-sm text-gray-500 font-normal ml-auto">
                {(activityData.distance / 1000).toFixed(1)} km
              </span>
            )}
          </h4>
          <ActivityMap mapData={mapData} className="h-48 sm:h-64" />
        </div>
      )}

      {/* Strava rate limit banner - shown once at top */}
      {stravaData?.rateLimit && (
        <StravaRateLimitBanner
          retryAfterSeconds={stravaData?.rateLimitSeconds || stravaData?.photos?.error?.retryAfterSeconds || stravaData?.segments?.error?.retryAfterSeconds || 0}
        />
      )}

      {/* Strava Photos - using pre-fetched data */}
      {!stravaData?.rateLimit && <StravaMedia activity={activityData} preFetchedData={stravaData?.photos} />}

      {/* Activity Overview: Chart + Stats */}
      <ActivityChart streams={streams} />

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {(activityData.moving_time || activityData.elapsed_time) > 0 && (
          <Tooltip text="Moving time is the time spent moving, i.e. excluding time when you were stopped. Elapsed time is the total duration of the activity.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Clock className="h-5 w-5 text-gray-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{formatDuration(activityData.moving_time || activityData.elapsed_time)}</div>
              <div className="text-xs text-gray-500">Duration</div>
            </div>
          </Tooltip>
        )}
        {/* Distance in km */}
        {activityData.distance > 0 && (
          <Tooltip text="Total distance covered during the activity.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Route className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{(activityData.distance / 1000).toFixed(2)}</div>
              <div className="text-xs text-gray-500">Distance (km)</div>
            </div>
          </Tooltip>
        )}
        {(activityData.icu_average_watts || activityData.average_watts) > 0 && (
          <Tooltip text="Average power output for the activity including time when you were not pedalling.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Gauge className="h-5 w-5 text-blue-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.icu_average_watts || activityData.average_watts)}W</div>
              <div className="text-xs text-gray-500">Avg Power</div>
            </div>
          </Tooltip>
        )}
        {(activityData.icu_weighted_avg_watts || activityData.weighted_average_watts) > 0 && (
          <Tooltip text="Normalized Power (NP) is an estimate of the power that you could have maintained for the same physiological cost if your power output had been perfectly constant. It is a better measure of the true physiological demands of a training session than average power.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Gauge className="h-5 w-5 text-purple-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.icu_weighted_avg_watts || activityData.weighted_average_watts)}W</div>
              <div className="text-xs text-gray-500">NP (Normalized)</div>
            </div>
          </Tooltip>
        )}
        {(activityData.icu_max_watts || activityData.max_watts) > 0 && (
          <Tooltip text="Maximum power output recorded during the activity.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Zap className="h-5 w-5 text-orange-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.icu_max_watts || activityData.max_watts)}W</div>
              <div className="text-xs text-gray-500">Max Power</div>
            </div>
          </Tooltip>
        )}
        {activityData.average_heartrate > 0 && (
          <Tooltip text="Average heart rate (bpm) for the activity.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Heart className="h-5 w-5 text-red-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.average_heartrate)}</div>
              <div className="text-xs text-gray-500">Avg HR</div>
            </div>
          </Tooltip>
        )}
        {activityData.max_heartrate > 0 && (
          <Tooltip text="Maximum heart rate (bpm) recorded during the activity.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Heart className="h-5 w-5 text-red-800 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.max_heartrate)}</div>
              <div className="text-xs text-gray-500">Max HR</div>
            </div>
          </Tooltip>
        )}
        {activityData.icu_training_load > 0 && (
          <Tooltip text="Training Stress Score (TSS) takes into account both the intensity (IF) and the duration of the training session. A one hour ride at threshold power has a TSS of 100. TSS < 150 is low (recovery generally complete by next day), 150–300 medium, 300–450 high, > 450 very high (residual fatigue lasting several days likely).">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Target className="h-5 w-5 text-orange-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.icu_training_load)}</div>
              <div className="text-xs text-gray-500">TSS</div>
            </div>
          </Tooltip>
        )}
        {activityData.icu_intensity > 0 && (
          <Tooltip text="Intensity Factor (IF) is the ratio of Normalized Power to your threshold power (FTP). IF < 0.75 = recovery, 0.75–0.85 = endurance, 0.85–0.95 = tempo, 0.95–1.05 = threshold, 1.05–1.15 = short TT or track, > 1.15 = prologue or pursuit.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Flame className="h-5 w-5 text-orange-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.icu_intensity)}%</div>
              <div className="text-xs text-gray-500">IF (Intensity)</div>
            </div>
          </Tooltip>
        )}
        {activityData.icu_variability_index > 0 && (
          <Tooltip text="Variability Index (VI) is Normalized Power divided by Average Power. It shows how steadily the activity was paced. A VI of 1.0 means perfectly constant effort. Time trials and triathlons should be 1.05 or less. Criteriums and mountain bike races may be 1.3 or higher.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <TrendingUp className="h-5 w-5 text-indigo-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{activityData.icu_variability_index.toFixed(2)}</div>
              <div className="text-xs text-gray-500">VI (Variability)</div>
            </div>
          </Tooltip>
        )}
        {activityData.icu_efficiency_factor > 0 && (
          <Tooltip text="Efficiency Factor (EF) is Normalized Power divided by average heart rate. It measures aerobic efficiency — the higher the value, the more power you produce per heartbeat. Track this over time on similar steady-state workouts to monitor aerobic fitness gains. Note: EF is affected by heat, stress and dehydration.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Activity className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{activityData.icu_efficiency_factor.toFixed(2)}</div>
              <div className="text-xs text-gray-500">EF (Efficiency)</div>
            </div>
          </Tooltip>
        )}
        {/* Average Cadence - for all sports that have it */}
        {activityData.average_cadence > 0 && (
          <Tooltip text={isRunning ? "Average cadence (steps per minute) for the activity." : "Average cadence (rpm) for the activity."}
          >
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <RotateCcw className="h-5 w-5 text-teal-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.average_cadence)}</div>
              <div className="text-xs text-gray-500">{isRunning ? 'Avg Cadence (spm)' : 'Avg Cadence (rpm)'}</div>
            </div>
          </Tooltip>
        )}
        {/* Max Cadence - calculated from intervals */}
        {maxCadenceFromIntervals > 0 && (
          <Tooltip text={isRunning ? "Maximum cadence (steps per minute) recorded during the activity." : "Maximum cadence (rpm) recorded during the activity."}
          >
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <RotateCcw className="h-5 w-5 text-teal-800 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(maxCadenceFromIntervals)}</div>
              <div className="text-xs text-gray-500">{isRunning ? 'Max Cadence (spm)' : 'Max Cadence (rpm)'}</div>
            </div>
          </Tooltip>
        )}
        {/* L/R Pedal Balance */}
        {activityData.avg_lr_balance > 0 && activityData.avg_lr_balance < 100 && (
          <Tooltip text="Average left/right power balance for the activity. 50/50 is perfectly even. A consistent imbalance may indicate a bike fit issue or muscle imbalance between legs.">
          <div className="bg-white rounded-lg p-3 text-center shadow-sm col-span-2 cursor-default">
            <Scale className="h-5 w-5 text-violet-600 mx-auto mb-1" />
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="text-lg font-bold text-violet-700">{(100 - activityData.avg_lr_balance).toFixed(1)}%</span>
              <span className="text-xs text-gray-400">L</span>
              <span className="text-gray-300 mx-1">/</span>
              <span className="text-lg font-bold text-indigo-700">{activityData.avg_lr_balance.toFixed(1)}%</span>
              <span className="text-xs text-gray-400">R</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden bg-indigo-200 mt-1">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${100 - activityData.avg_lr_balance}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">L/R Pedal Balance</div>
          </div>
          </Tooltip>
        )}
        {/* Pace - for running activities */}
        {isRunning && formatPace(paceValue) && (
          <Tooltip text="Average pace (min/km) for the activity.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Footprints className="h-5 w-5 text-cyan-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{formatPace(paceValue)}</div>
              <div className="text-xs text-gray-500">Avg Pace (min/km)</div>
            </div>
          </Tooltip>
        )}
        {/* Stride Length - for running activities */}
        {isRunning && activityData.average_stride > 0 && (
          <Tooltip text="Average stride length for the activity.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Footprints className="h-5 w-5 text-cyan-800 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{(activityData.average_stride * 100).toFixed(0)}</div>
              <div className="text-xs text-gray-500">Avg Stride (cm)</div>
            </div>
          </Tooltip>
        )}
        {/* Elevation Gain (Climbing) */}
        {activityData.total_elevation_gain > 0 && (
          <Tooltip text="Total elevation gained during the activity.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Mountain className="h-5 w-5 text-amber-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{Math.round(activityData.total_elevation_gain)}</div>
              <div className="text-xs text-gray-500">Climbing (m)</div>
            </div>
          </Tooltip>
        )}
        {/* Calories (kcal) */}
        {getActivityKcal(activityData) > 0 && (
          <Tooltip text="Estimated energy expenditure in kilocalories. Calculated from power data (joules) if available, otherwise estimated from heart rate.">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm cursor-default">
              <Utensils className="h-5 w-5 text-rose-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{getActivityKcal(activityData)}</div>
              <div className="text-xs text-gray-500">Calories (kcal)</div>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Power Curve (for cycling) */}
      {powerCurve && <ActivityPowerCurve powerCurve={powerCurve} />}

      {/* Pace Curve (for running) */}
      {isRunning && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          {paceCurve ? (
            <PaceCurveChart paceCurveHistory={[paceCurve]} />
          ) : (
            <div className="text-center py-4 text-gray-400">
              <Timer className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No pace curve data available</p>
              <p className="text-xs">Velocity data may be missing from streams</p>
            </div>
          )}
        </div>
      )}

      {/* HR Drift / Decoupling Section */}
      {(hrDrift !== null && hrDrift !== undefined) && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-600" />
            Heart Rate Drift (Pw:Hr Decoupling)
          </h4>
          <div className="flex items-center gap-4">
            <div className={`text-2xl font-bold ${hrDrift <= 2 ? 'text-green-600' : hrDrift <= 4 ? 'text-green-600' : hrDrift <= 6 ? 'text-blue-600' : hrDrift <= 8 ? 'text-yellow-600' : hrDrift <= 12 ? 'text-orange-600' : hrDrift <= 15 ? 'text-red-600' : 'text-red-600'}`}>
              {hrDrift > 0 ? '+' : ''}{hrDrift.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">
              {hrDrift <= 2 ? (
                <span className="text-green-700">Exceptional - Elite level aerobic stability</span>
              ) : hrDrift <= 4 ? (
                <span className="text-green-700">Excellent - Strong aerobic base</span>
              ) : hrDrift <= 6 ? (
                <span className="text-blue-700">Good - Well-trained endurance</span>
              ) : hrDrift <= 8 ? (
                <span className="text-yellow-700">Moderate drift - Aerobic base can improve</span>
              ) : hrDrift <= 12 ? (
                <span className="text-orange-700">High drift - Intensity near aerobic threshold</span>
              ) : hrDrift <= 15 ? (
                <span className="text-red-700">Very high drift - Limited endurance at intensity</span>
              ) : (
                <span className="text-red-700">Excessive drift - Fatigue, heat, dehydration or too high intensity</span>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Measures how much your heart rate increased relative to power output during the activity.
          </p>
        </div>
      )}

      {/* All Intervals */}
      {Array.isArray(allIntervals) && allIntervals.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Timer className="h-4 w-4" />
            All Intervals ({allIntervals.length})
            {workIntervals.length > 0 && <span className="text-sm text-gray-500">({workIntervals.length} work)</span>}
          </h4>
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white">
                  <th className="text-left py-2 px-1 font-medium text-gray-600 text-xs">Type</th>
                  <th className="text-left py-2 px-1 font-medium text-gray-600 text-xs">Duration</th>
                  <th className="text-right py-2 px-1 font-medium text-gray-600 text-xs">Avg W</th>
                  <th className="text-right py-2 px-1 font-medium text-gray-600 text-xs">Avg HR</th>
                  <th className="text-right py-2 px-1 font-medium text-gray-600 text-xs">HRR</th>
                </tr>
              </thead>
              <tbody>
                {allIntervals.map((interval, idx) => {
                  const isWork = interval.type === 'WORK';
                  const isRest = interval.type === 'RECOVERY' || interval.type === 'REST';
                  let hrr = null;
                  if (isRest) {
                    const restIdx = restIntervals.indexOf(interval);
                    if (restIdx >= 0) {
                      hrr = getHRRecoveryForRest(restIdx);
                    }
                  }
                  return (
                    <tr key={idx} className={`border-t border-gray-100 ${isWork ? 'bg-blue-50' : isRest ? 'bg-green-50' : 'bg-white'}`}>
                      <td className="py-2 px-1">
                        <span className={`text-xs px-1 py-0.5 rounded ${isWork ? 'bg-blue-200 text-blue-800' : isRest ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                          {interval.type || 'SEG'}
                        </span>
                      </td>
                      <td className="py-2 px-1 text-xs">{formatDuration(interval.elapsed_time || interval.moving_time)}</td>
                      <td className="py-2 px-1 text-right font-medium text-blue-600 text-xs">
                        {interval.average_watts ? Math.round(interval.average_watts) : '-'}
                      </td>
                      <td className="py-2 px-1 text-right font-medium text-red-600 text-xs">
                        {interval.average_heartrate ? Math.round(interval.average_heartrate) : '-'}
                      </td>
                      <td className="py-2 px-1 text-right text-xs">
                        {hrr !== null ? (
                          <span className={`font-medium ${hrr > 30 ? 'text-green-600' : hrr > 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {hrr}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Strava Segments - using pre-fetched data */}
      {!stravaData?.rateLimit && <StravaSegments activity={activityData} preFetchedData={stravaData?.segments ? { ...stravaData.segments, segmentPRs: stravaData.segmentPRs } : null} />}

      {/* Achievements / Records */}
      {achievements && achievements.length > 0 && (
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <h4 className="font-medium text-yellow-900 mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-600" />
            Records & Achievements
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {achievements.map((achievement, idx) => {
              // Build achievement message from available data
              let achievementMessage = achievement.message || achievement.description || achievement.name || '';
              
              // If no message, build one from the data
              if (!achievementMessage && achievement.type) {
                if (achievement.type === 'FTP_UP' && achievement.watts && achievement.secs) {
                  const minutes = Math.floor(achievement.secs / 60);
                  const seconds = achievement.secs % 60;
                  const timeStr = seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
                  
                  // Use icu_rolling_ftp and icu_rolling_ftp_delta from activity data
                  const newFtp = activityData.icu_rolling_ftp;
                  const ftpDelta = activityData.icu_rolling_ftp_delta;
                  
                  if (newFtp && ftpDelta) {
                    achievementMessage = `FTP +${ftpDelta} to ${newFtp}w from ${timeStr} at ${achievement.watts}w`;
                  } else {
                    achievementMessage = `FTP increased based on ${timeStr} effort at ${achievement.watts}w`;
                  }
                } else if (achievement.type === 'BEST_POWER' && achievement.watts && achievement.secs) {
                  const minutes = Math.floor(achievement.secs / 60);
                  const seconds = achievement.secs % 60;
                  const timeStr = seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
                  achievementMessage = `Best ${timeStr} power: ${achievement.watts}w`;
                } else if (achievement.type === 'BEST_PACE' && achievement.pace && achievement.distance) {
                  achievementMessage = `Best pace: ${achievement.pace} for ${achievement.distance}km`;
                } else if (achievement.type === 'LTHR_UP' && achievement.value) {
                  achievementMessage = `New LTHR: ${achievement.value} bpm`;
                }
              }
              
              return (
              <div 
                key={idx}
                className="bg-white rounded-lg border border-yellow-300 p-3"
              >
                <div className="flex items-center gap-1 mb-1">
                  <Trophy className="h-3 w-3 text-yellow-500" />
                  <span className="text-xs font-medium text-yellow-700">
                    {achievement.type === 'pr' ? 'PR' : achievement.type}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{achievementMessage || 'Achievement unlocked'}</p>
              </div>
            );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityDetailsView;
