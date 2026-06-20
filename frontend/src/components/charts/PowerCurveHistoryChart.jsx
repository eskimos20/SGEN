import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Zap } from 'lucide-react';

// Color mapping for different sport types (Intervals.icu supported types)
const SPORT_COLORS = {
  'Ride': '#f97316',        // Orange
  'Run': '#3b82f6',         // Blue
  'VirtualRide': '#8b5cf6',   // Purple
  'VirtualRun': '#06b6d4',    // Cyan
  'VirtualSki': '#10b981'     // Emerald
};

const SPORT_LABELS = {
  'Ride': 'Cycling',
  'Run': 'Running',
  'VirtualRide': 'Virtual Ride',
  'VirtualRun': 'Virtual Run',
  'VirtualSki': 'Virtual Ski'
};

const PowerCurveHistoryChart = ({ powerCurveHistory }) => {
  // Process curves by sport type
  const curvesBySport = useMemo(() => {
    if (!powerCurveHistory || !Array.isArray(powerCurveHistory) || powerCurveHistory.length === 0) {
      return {};
    }

    const grouped = {};
    
    powerCurveHistory.forEach(curve => {
      if (!curve.secs || !curve.values) return;
      
      const sportType = curve.sportType || 'Ride';
      if (!grouped[sportType]) {
        grouped[sportType] = [];
      }
      
      // Convert to data points
      const points = curve.secs.map((sec, idx) => ({
        duration: sec,
        watts: curve.values[idx] || 0,
        durationLabel: formatDuration(sec)
      })).filter(p => p.watts > 0);
      
      grouped[sportType].push(...points);
    });

    return grouped;
  }, [powerCurveHistory]);

  // Get all unique sport types that have data
  const sportTypes = useMemo(() => {
    return Object.keys(curvesBySport).filter(sport => curvesBySport[sport].length > 0);
  }, [curvesBySport]);

  // Merge all curves into a single data array for the chart
  // Each data point has duration + watts for each sport type
  const mergedData = useMemo(() => {
    if (sportTypes.length === 0) return [];

    // Collect all unique durations across all sports
    const allDurations = new Set();
    sportTypes.forEach(sport => {
      curvesBySport[sport].forEach(p => allDurations.add(p.duration));
    });
    
    // Sort durations
    const sortedDurations = Array.from(allDurations).sort((a, b) => a - b);
    
    // Create merged data points
    return sortedDurations.map(duration => {
      const point = { duration, durationLabel: formatDuration(duration) };
      
      sportTypes.forEach(sport => {
        // Find closest point for this sport at this duration
        const sportPoints = curvesBySport[sport];
        const closest = sportPoints.reduce((best, p) => {
          const diff = Math.abs(p.duration - duration);
          if (diff < best.diff) return { point: p, diff };
          return best;
        }, { point: null, diff: Infinity });
        
        point[`watts_${sport}`] = closest.point ? closest.point.watts : null;
      });
      
      return point;
    });
  }, [curvesBySport, sportTypes]);

  // Calculate stats for each sport
  const sportStats = useMemo(() => {
    const stats = {};
    
    sportTypes.forEach(sport => {
      const points = curvesBySport[sport];
      if (!points.length) return;
      
      const watts = points.map(p => p.watts);
      const max = Math.max(...watts);
      
      // Calculate FTP estimate with proper multipliers:
      // - 60min power = direct FTP
      // - 20min power × 0.95
      // - 5min power × 0.80
      const hour60 = points.find(p => Math.abs(p.duration - 3600) < 60);
      const min20 = points.find(p => Math.abs(p.duration - 1200) < 30);
      const min5 = points.find(p => Math.abs(p.duration - 300) < 15);
      
      let ftpEstimate = 0;
      if (hour60) {
        ftpEstimate = Math.round(hour60.watts);
      } else if (min20) {
        ftpEstimate = Math.round(min20.watts * 0.95);
      } else if (min5) {
        ftpEstimate = Math.round(min5.watts * 0.80);
      }
      
      stats[sport] = { max, ftpEstimate, count: points.length };
    });
    
    return stats;
  }, [curvesBySport, sportTypes]);

  // Calculate Y domain max
  const yDomainMax = useMemo(() => {
    if (sportTypes.length === 0) return 100;
    
    let maxWatts = 0;
    sportTypes.forEach(sport => {
      const points = curvesBySport[sport];
      points.forEach(p => {
        if (p.watts > maxWatts) maxWatts = p.watts;
      });
    });
    
    return Math.ceil(maxWatts / 50) * 50 + 20;
  }, [curvesBySport, sportTypes]);

  if (sportTypes.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header with key stats */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-orange-600" />
          <h3 className="text-lg font-semibold text-gray-900">Power Curve History</h3>
        </div>
      </div>

      {/* Sport Stats Grid */}
      {Object.keys(sportStats).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Object.entries(sportStats).map(([sport, stats]) => (
            <div 
              key={sport} 
              className="rounded-lg p-2 text-center border"
              style={{ 
                backgroundColor: `${SPORT_COLORS[sport]}15`,
                borderColor: `${SPORT_COLORS[sport]}30`
              }}
            >
              <div className="text-xs text-gray-500">{SPORT_LABELS[sport] || sport}</div>
              <div className="font-bold" style={{ color: SPORT_COLORS[sport] }}>
                {stats.max}W max
              </div>
              {stats.ftpEstimate > 0 && (
                <div className="text-xs text-gray-500">
                  FTP: {stats.ftpEstimate}W
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Power Curve Chart */}
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
              ticks={[1, 5, 10, 30, 60, 120, 300, 600, 1200, 3600]}
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
            />
            <YAxis
              domain={[0, yDomainMax]}
              tickFormatter={(value) => `${value}W`}
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              width={45}
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
                          const sport = p.dataKey.replace('watts_', '');
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: p.color }}
                              />
                              <span style={{ color: p.color }}>
                                {SPORT_LABELS[sport] || sport}: {p.value}W
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
                dataKey={`watts_${sport}`}
                name={SPORT_LABELS[sport] || sport}
                stroke={SPORT_COLORS[sport] || '#8884d8'}
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
              style={{ backgroundColor: SPORT_COLORS[sport] || '#8884d8' }}
            />
            <span>{SPORT_LABELS[sport] || sport}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper to format duration in human-readable format
function formatDuration(seconds) {
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
}

export default PowerCurveHistoryChart;
