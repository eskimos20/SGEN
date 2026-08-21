import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Zap, TrendingUp } from 'lucide-react';

const ActivityPowerCurve = ({ powerCurve }) => {
  const curveData = useMemo(() => {
    if (!powerCurve || !powerCurve.secs || !powerCurve.values) return null;
    
    const { secs, values } = powerCurve;
    if (secs.length === 0 || values.length === 0) return null;
    
    // Combine secs and values into data points
    const points = secs.map((sec, idx) => ({
      duration: sec,
      watts: values[idx] || 0,
      durationLabel: formatDuration(sec)
    })).filter(p => p.watts > 0);
    
    return points;
  }, [powerCurve]);

  const keyPoints = useMemo(() => {
    if (!curveData || curveData.length === 0) return null;
    
    // Find closest index for key durations
    const findClosest = (targetSec) => {
      let closest = null;
      let minDiff = Infinity;
      curveData.forEach((point, idx) => {
        const diff = Math.abs(point.duration - targetSec);
        if (diff < minDiff) {
          minDiff = diff;
          closest = { ...point, index: idx };
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
  }, [curveData]);

  if (!curveData || curveData.length === 0) return null;

  const maxWatts = Math.max(...curveData.map(d => d.watts));
  const yDomainMax = Math.ceil(maxWatts / 50) * 50 + 20; // Round up to nearest 50, add padding

  return (
    <div className="bg-white sm:rounded-lg sm:shadow-sm p-3 sm:p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-gray-900 flex items-center gap-2">
          <Zap className="h-4 w-4 text-orange-600" />
          Power Curve
        </h4>
        {keyPoints && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <TrendingUp className="h-3 w-3" />
            <span>Peak: {maxWatts}W</span>
          </div>
        )}
      </div>

      {/* Key Power Points */}
      {keyPoints && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          {keyPoints.sec5 && (
            <div className="bg-orange-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">5s</div>
              <div className="font-bold text-orange-700">{keyPoints.sec5.watts}W</div>
            </div>
          )}
          {keyPoints.sec30 && (
            <div className="bg-yellow-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">30s</div>
              <div className="font-bold text-yellow-700">{keyPoints.sec30.watts}W</div>
            </div>
          )}
          {keyPoints.min1 && (
            <div className="bg-green-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">1min</div>
              <div className="font-bold text-green-700">{keyPoints.min1.watts}W</div>
            </div>
          )}
          {keyPoints.min5 && (
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">5min</div>
              <div className="font-bold text-blue-700">{keyPoints.min5.watts}W</div>
            </div>
          )}
          {keyPoints.min20 && (
            <div className="bg-indigo-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">20min</div>
              <div className="font-bold text-indigo-700">{keyPoints.min20.watts}W</div>
            </div>
          )}
          {keyPoints.min60 && (
            <div className="bg-purple-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">60min</div>
              <div className="font-bold text-purple-700">{keyPoints.min60.watts}W</div>
            </div>
          )}
        </div>
      )}

      {/* Power Curve Chart */}
      <div className="h-48 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curveData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
                      <div className="font-medium">{data.durationLabel}</div>
                      <div className="text-orange-400">{data.watts} watts</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* Reference lines for key durations */}
            {keyPoints?.min5 && (
              <ReferenceLine x={300} stroke="#3b82f6" strokeDasharray="3 3" strokeOpacity={0.5} />
            )}
            {keyPoints?.min20 && (
              <ReferenceLine x={1200} stroke="#6366f1" strokeDasharray="3 3" strokeOpacity={0.5} />
            )}
            <Line 
              type="monotone" 
              dataKey="watts" 
              stroke="#f97316" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-orange-500 rounded"></div>
          <span>Max power for duration</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-blue-500 rounded opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #3b82f6 0, #3b82f6 2px, transparent 2px, transparent 5px)' }}></div>
          <span>5/20 min markers</span>
        </div>
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

export default ActivityPowerCurve;
