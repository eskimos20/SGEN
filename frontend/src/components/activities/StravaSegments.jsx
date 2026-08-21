import { useState, useEffect } from 'react';
import { MapPin, Clock, Zap, Trophy, ChevronRight, Activity, Timer } from 'lucide-react';
import api from '../../api/axios';

const StravaSegments = ({ activity, preFetchedData }) => {
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasStravaToken, setHasStravaToken] = useState(false);
  const [segmentPRs, setSegmentPRs] = useState({});
  const [prDataReady, setPrDataReady] = useState(false); // true once PR fetch attempted


  // Check if user has Strava connection
  useEffect(() => {
    const checkStravaConnection = async () => {
      try {
        const response = await api.get('/user/me');
        setHasStravaToken((response.data.stravaEnabled && response.data.hasStravaToken) || false);
      } catch (err) {
        setHasStravaToken(false);
      }
    };
    checkStravaConnection();
  }, []);

  useEffect(() => {
    // Use pre-fetched data if available
    if (preFetchedData) {
      if (preFetchedData.found && preFetchedData.segments) {
        const segmentList = Array.isArray(preFetchedData.segments) 
          ? preFetchedData.segments 
          : [];
        setSegments(segmentList);
        
        // segmentPRs comes merged in from ActivityDetailsView
        // If present: mark ready immediately. If absent: still mark ready (batch failed gracefully)
        setSegmentPRs(preFetchedData.segmentPRs || {});
        setPrDataReady(true);
      } else {
        setSegments([]);
      }
      
      return;
    }
    
    // Wait for token check to complete before fetching
    // hasStravaToken will be null initially while checking
    if (hasStravaToken === null || !hasStravaToken || !activity?.start_date) {
      return;
    }

    const fetchSegments = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const startDate = Math.floor(new Date(activity.start_date).getTime() / 1000);
        
        const response = await api.get('/strava/segments/by-date', {
          params: {
            startDate,
            toleranceSeconds: 300
          }
        });

        if (response.data.found && response.data.segments) {
          const segmentList = Array.isArray(response.data.segments) 
            ? response.data.segments 
            : [];
          setSegments(segmentList);
          // Batch-fetch PR data for all segments in parallel
          const segmentIds = segmentList.map(e => e.segment?.id).filter(Boolean);
          if (segmentIds.length > 0) {
            try {
              const batchResponse = await api.post('/strava/segments/batch-pr', { segmentIds });
              const batchData = batchResponse.data || {};
              const prData = {};
              Object.entries(batchData).forEach(([id, pr]) => {
                prData[Number(id)] = {
                  time: pr.prTime,
                  watts: pr.prWatts,
                  komTime: pr.komTime,
                  qomTime: pr.qomTime,
                  hasPR: pr.hasPR
                };
              });
              setSegmentPRs(prData);
            } catch (err) {
              // Silent fail - PR data is optional
            } finally {
              setPrDataReady(true);
            }
          } else {
            setPrDataReady(true);
          }
        } else {
          setSegments([]);
        }
      } catch (err) {
        // Check for rate limit error
        if (err.response?.status === 429) {
          const retryAfter = err.response?.data?.retryAfterFormatted || '15 minutes';
          setError({
            type: 'rate_limit',
            message: `Strava API rate limit exceeded. Try again in ${retryAfter}.`,
            retryAfter
          });
        } else {
          setError({ type: 'generic', message: 'Failed to load segments' });
        }
        setSegments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSegments();
  }, [activity, hasStravaToken, preFetchedData]);

  // Don't render anything if no Strava connection (but allow pre-fetched data to show)
  if (!hasStravaToken && !preFetchedData) return null;
  
  if (segments.length === 0) return null;
  
  // PR is loading only while fetch hasn't been attempted yet
  const prLoading = !prDataReady && segments.length > 0;

  // Format time from seconds to MM:SS or HH:MM:SS
  const formatTime = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format speed/pace
  const formatSpeed = (metersPerSecond, isRunning) => {
    if (!metersPerSecond) return '-';
    
    if (isRunning) {
      // Convert to min/km
      const secPerKm = 1000 / metersPerSecond;
      const mins = Math.floor(secPerKm / 60);
      const secs = Math.round(secPerKm % 60);
      return `${mins}:${secs.toString().padStart(2, '0')} /km`;
    } else {
      // Cycling: km/h
      const kmh = (metersPerSecond * 3.6).toFixed(1);
      return `${kmh} km/h`;
    }
  };

  // Calculate W/kg if athlete weight available
  const calculateWkg = (watts, weightKg) => {
    if (!watts || !weightKg) return null;
    return (watts / weightKg).toFixed(2);
  };

  return (
    <div className="bg-white sm:rounded-lg sm:shadow-sm p-2 sm:p-3">
      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        Strava Segments
        <span className="text-sm text-gray-500 font-normal ml-auto">
          {segments.length} segment{segments.length !== 1 ? 's' : ''}
          {prLoading && <span className="ml-2 text-xs">(laddar PR...)</span>}
        </span>
      </h4>

      <div className="space-y-2">
        {segments.map((effort, idx) => {
          const segment = effort.segment || {};
          const isPR = effort.pr || false;
          const isRunning = segment.activity_type === 'Run';
          
          return (
            <div 
              key={effort.id || idx} 
              className={`border rounded-lg p-3 ${isPR ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}
            >
              {/* Segment Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {isPR && <Trophy className="h-4 w-4 text-yellow-600" />}
                  <span className="font-medium text-gray-900">{segment.name || 'Unnamed Segment'}</span>
                </div>
                <a 
                  href={`https://www.strava.com/segments/${segment.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                >
                  View <ChevronRight className="h-3 w-3" />
                </a>
              </div>

              {/* Segment Stats Grid - 6 boxes: This Ride (Time, Power, Speed), PR (Time, Power, Speed) */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-sm">
                {/* This Ride - Time */}
                <div className={`rounded p-2 text-center ${isPR ? 'bg-yellow-100 border border-yellow-300' : 'bg-blue-50 border border-blue-200'}`}>
                  <div className={`flex items-center justify-center gap-1 text-xs mb-1 ${isPR ? 'text-yellow-700' : 'text-blue-600'}`}>
                    <Clock className="h-3 w-3" />
                    This Ride
                    {isPR && <Trophy className="h-3 w-3 text-yellow-600 ml-1" />}
                  </div>
                  <div className={`font-bold text-lg ${isPR ? 'text-yellow-800' : 'text-blue-700'}`}>
                    {formatTime(effort.elapsed_time)}
                  </div>
                </div>

                {/* This Ride - Power */}
                <div className="bg-purple-50 border border-purple-200 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-purple-600 text-xs mb-1">
                    <Zap className="h-3 w-3" />
                    Power
                  </div>
                  <div className="font-bold text-lg text-purple-700">
                    {effort.average_watts > 0 ? Math.round(effort.average_watts) + 'W' : '-'}
                  </div>
                </div>

                {/* This Ride - Speed */}
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-emerald-600 text-xs mb-1">
                    <Activity className="h-3 w-3" />
                    {isRunning ? 'Pace' : 'Speed'}
                  </div>
                  <div className="font-bold text-lg text-emerald-700">
                    {formatSpeed(effort.distance / effort.elapsed_time, isRunning)}
                  </div>
                </div>

                {/* PR - Time */}
                <div className="bg-orange-50 border border-orange-200 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-orange-600 text-xs mb-1">
                    <Trophy className="h-3 w-3" />
                    Your PR
                  </div>
                  <div className="font-bold text-lg text-orange-700">
                    {prLoading ? '...' : formatTime(segmentPRs[segment.id]?.time)}
                  </div>
                </div>

                {/* PR - Power */}
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-amber-600 text-xs mb-1">
                    <Zap className="h-3 w-3" />
                    PR Power
                  </div>
                  <div className="font-bold text-lg text-amber-700">
                    {prLoading ? '...' : (segmentPRs[segment.id]?.watts > 0 ? Math.round(segmentPRs[segment.id].watts) + 'W' : '-')}
                  </div>
                </div>

                {/* PR - Speed */}
                <div className="bg-teal-50 border border-teal-200 rounded p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-teal-600 text-xs mb-1">
                    <Activity className="h-3 w-3" />
                    PR {isRunning ? 'Pace' : 'Speed'}
                  </div>
                  <div className="font-bold text-lg text-teal-700">
                    {prLoading ? '...' : (segmentPRs[segment.id]?.time ? formatSpeed(segment.distance / segmentPRs[segment.id].time, isRunning) : '-')}
                  </div>
                </div>
              </div>

              {/* KOM/QOM Info */}
              {(segmentPRs[segment.id]?.komTime || segmentPRs[segment.id]?.qomTime) && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded p-2">
                  <div className="flex items-center gap-3 text-xs">
                    {segmentPRs[segment.id]?.komTime && (
                      <span className="text-red-700">
                        <span className="font-semibold">KOM:</span> {segmentPRs[segment.id].komTime}
                      </span>
                    )}
                    {segmentPRs[segment.id]?.qomTime && (
                      <span className="text-pink-600">
                        <span className="font-semibold">QOM:</span> {segmentPRs[segment.id].qomTime}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                <span>{(segment.distance / 1000).toFixed(2)} km</span>
                <span>{Math.round(segment.elevation_high - segment.elevation_low)}m elev</span>
                <span>{Math.round(segment.average_grade * 10) / 10}% avg grade</span>
                {effort.max_watts > 0 && <span>Max {Math.round(effort.max_watts)}W</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StravaSegments;
