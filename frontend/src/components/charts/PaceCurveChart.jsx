import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Timer } from 'lucide-react';

// Color mapping for running types
const RUN_COLORS = {
  'Run': '#3b82f6',         // Blue
  'TrailRun': '#10b981',    // Emerald
  'VirtualRun': '#06b6d4',  // Cyan
  'Hike': '#f59e0b'         // Amber
};

const RUN_LABELS = {
  'Run': 'Road Running',
  'TrailRun': 'Trail Running',
  'VirtualRun': 'Treadmill/Virtual',
  'Hike': 'Hiking'
};

/**
 * Convert velocity (m/s) to pace string (min:sec/km)
 */
const velocityToPace = (velocityMs) => {
  if (velocityMs <= 0) return '--:--';
  const secondsPerKm = 1000 / velocityMs;
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.floor(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format duration in human-readable format
 */
const formatDuration = (seconds) => {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  }
};

const PaceCurveChart = ({ paceCurveHistory }) => {
  // Process pace curves
  const curvesBySport = useMemo(() => {
    if (!paceCurveHistory || !Array.isArray(paceCurveHistory) || paceCurveHistory.length === 0) {
      return {};
    }

    const grouped = {};
    
    paceCurveHistory.forEach(curve => {
      if (!curve.paceData || Object.keys(curve.paceData).length === 0) return;
      
      const sportType = curve.sportType || 'Run';
      if (!grouped[sportType]) {
        grouped[sportType] = [];
      }
      
      // Convert paceData object to array of points
      const points = Object.entries(curve.paceData).map(([duration, velocity]) => ({
        duration: parseInt(duration),
        velocity: velocity,
        pace: velocityToPace(velocity),
        durationLabel: formatDuration(parseInt(duration)),
        activityDate: curve.activityDate,
        activityName: curve.activityName
      })).sort((a, b) => a.duration - b.duration);
      
      grouped[sportType].push(...points);
    });

    return grouped;
  }, [paceCurveHistory]);

  // Get all unique sport types that have data
  const sportTypes = useMemo(() => {
    return Object.keys(curvesBySport).filter(sport => curvesBySport[sport].length > 0);
  }, [curvesBySport]);

  // Merge all curves into a single data array for the chart
  // For pace, we want to show the best (fastest) pace for each duration
  const mergedData = useMemo(() => {
    if (sportTypes.length === 0) return [];

    // Collect all unique durations across all sports
    const allDurations = new Set();
    sportTypes.forEach(sport => {
      curvesBySport[sport].forEach(p => allDurations.add(p.duration));
    });
    
    // Sort durations
    const sortedDurations = Array.from(allDurations).sort((a, b) => a - b);
    
    // Create merged data points showing best pace for each duration
    return sortedDurations.map(duration => {
      const point = { duration, durationLabel: formatDuration(duration) };
      
      sportTypes.forEach(sport => {
        // Find the fastest pace (highest velocity) for this sport at this duration
        const sportPoints = curvesBySport[sport].filter(p => p.duration === duration);
        if (sportPoints.length > 0) {
          const bestPoint = sportPoints.reduce((best, p) => 
            p.velocity > best.velocity ? p : best
          );
          // Use pace (seconds per km) for chart to match Y-axis scale
          // Convert velocity (m/s) to pace (sec/km): 1000 / velocity
          const paceSecondsPerKm = 1000 / bestPoint.velocity;
          point[`pace_${sport}`] = paceSecondsPerKm;
          point[`paceStr_${sport}`] = bestPoint.pace; // Keep string format for display
        }
      });
      
      return point;
    });
  }, [curvesBySport, sportTypes]);

  // Find key pace points (5s, 30s, 1min, 5min, 20min, 60min) for display
  const keyPoints = useMemo(() => {
    if (!mergedData || mergedData.length === 0) return null;
    
    // Find closest point for each target duration
    const findClosest = (targetSec) => {
      let closest = null;
      let minDiff = Infinity;
      mergedData.forEach((point) => {
        const diff = Math.abs(point.duration - targetSec);
        if (diff < minDiff) {
          minDiff = diff;
          closest = point;
        }
      });
      return closest;
    };
    
    return {
      sec5: findClosest(5),
      sec30: findClosest(30),
      min1: findClosest(60),
      min5: findClosest(300),
      min20: findClosest(1200),
      min60: findClosest(3600)
    };
  }, [mergedData]);
  
  // Get the first sport for key points display (usually only one sport for single activity)
  const firstSport = sportTypes.length > 0 ? sportTypes[0] : null;

  // Calculate Y domain (pace values - note: lower is better/faster)
  const yDomain = useMemo(() => {
    if (sportTypes.length === 0) return [0, 10];
    
    let minVelocity = Infinity;
    let maxVelocity = 0;
    
    sportTypes.forEach(sport => {
      const points = curvesBySport[sport];
      points.forEach(p => {
        if (p.velocity > maxVelocity) maxVelocity = p.velocity;
        if (p.velocity < minVelocity) minVelocity = p.velocity;
      });
    });
    
    // For pace chart, we want faster (lower pace values) at the top
    // Convert to min/km for Y-axis
    const maxPace = minVelocity > 0 ? 1000 / minVelocity : 10; // slowest = max pace value
    const minPace = maxVelocity > 0 ? 1000 / maxVelocity : 3;  // fastest = min pace value
    
    return [Math.max(0, minPace - 0.5), maxPace + 0.5];
  }, [curvesBySport, sportTypes]);

  if (sportTypes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Timer className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No pace data available</p>
        <p className="text-sm">Complete some running activities to see pace curves</p>
      </div>
    );
  }

  // Helper to format pace seconds to min:sec
  const formatPaceFromSeconds = (seconds) => {
    if (!seconds || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Header with key stats */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Pace Curve History</h3>
        </div>
      </div>

      {/* Key Pace Points Grid (like ActivityPowerCurve) */}
      {keyPoints && firstSport && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { key: 'sec5', label: '5s', duration: 5 },
            { key: 'sec30', label: '30s', duration: 30 },
            { key: 'min1', label: '1min', duration: 60 },
            { key: 'min5', label: '5min', duration: 300 },
            { key: 'min20', label: '20min', duration: 1200 },
            { key: 'min60', label: '60min', duration: 3600 },
          ].map(({ key, label, duration }) => {
            const point = keyPoints[key];
            if (!point) return null;
            
            // Get pace for this sport
            const paceKey = `paceStr_${firstSport}`;
            const pace = point[paceKey] || formatPaceFromSeconds(point[`pace_${firstSport}`]);
            
            return (
              <div 
                key={key}
                className="rounded-lg p-2 text-center border cursor-pointer hover:opacity-80 transition-opacity"
                style={{ 
                  backgroundColor: `${RUN_COLORS[firstSport] || '#3b82f6'}15`,
                  borderColor: `${RUN_COLORS[firstSport] || '#3b82f6'}30`
                }}
              >
                <div className="text-xs text-gray-500">{label}</div>
                <div 
                  className="text-sm font-semibold" 
                  style={{ color: RUN_COLORS[firstSport] || '#3b82f6' }}
                >
                  {pace}/km
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pace Curve Chart */}
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergedData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="duration"
              scale="log"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => formatDuration(value)}
              type="number"
              ticks={[30, 60, 120, 300, 600, 1200, 1800, 3600, 7200]}
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(value) => `${Math.floor(value)}:${Math.round((value % 1) * 60).toString().padStart(2, '0')}`}
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              width={50}
              reversed={true} // Lower pace (faster) at top
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
                      <div className="font-medium mb-1">{data.durationLabel}</div>
                      {payload
                        .filter(p => p.value != null)
                        .map((p, idx) => {
                          const sport = p.dataKey.replace('pace_', '');
                          const pace = data[`paceStr_${sport}`];
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: p.color }}
                              />
                              <span style={{ color: p.color }}>
                                {RUN_LABELS[sport] || sport}: {pace}/km
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  );
                }
                return null;
              }}
            />
            {sportTypes.map(sport => (
              <Line
                key={sport}
                type="monotone"
                dataKey={`pace_${sport}`}
                name={RUN_LABELS[sport] || sport}
                stroke={RUN_COLORS[sport] || '#3b82f6'}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500">
        {sportTypes.map(sport => (
          <div key={sport} className="flex items-center gap-1">
            <div 
              className="w-3 h-0.5 rounded" 
              style={{ backgroundColor: RUN_COLORS[sport] || '#3b82f6' }}
            />
            <span>{RUN_LABELS[sport] || sport}</span>
          </div>
        ))}
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 text-center">
        Lower line = faster pace (better). Chart shows best pace achieved for each duration.
      </p>
    </div>
  );
};

export default PaceCurveChart;
