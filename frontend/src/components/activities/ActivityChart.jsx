import { Activity } from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

const ActivityChart = ({ streams }) => {
  if (!streams) return null;
  
  // Streams can come as array of objects with type/data or as object with keys
  let timeData = [];
  let powerData = [];
  let hrData = [];
  
  if (Array.isArray(streams)) {
    // Format: [{type: 'time', data: [...]}, ...]
    const timeStream = streams.find(s => s.type === 'time');
    const wattsStream = streams.find(s => s.type === 'watts');
    const hrStream = streams.find(s => s.type === 'heartrate');
    timeData = timeStream?.data || [];
    powerData = wattsStream?.data || [];
    hrData = hrStream?.data || [];
  } else {
    // Format: {time: [1,2,3], watts: [100,200], heartrate: [120,130]} (direct arrays)
    // OR {time: {data: [...]}, watts: {data: [...]}, ...} (wrapped in data property)
    timeData = Array.isArray(streams.time) ? streams.time : (streams.time?.data || []);
    powerData = Array.isArray(streams.watts) ? streams.watts : (streams.watts?.data || []);
    hrData = Array.isArray(streams.heartrate) ? streams.heartrate : (streams.heartrate?.data || []);
    
    // Fallback: try common stream names from intervals.icu
    if (timeData.length === 0 && Array.isArray(streams.time)) timeData = streams.time;
    if (powerData.length === 0 && Array.isArray(streams.watts)) powerData = streams.watts;
    if (hrData.length === 0 && Array.isArray(streams.heartrate)) hrData = streams.heartrate;
  }
  
  if (timeData.length === 0) return null;
  
  // Sample data to reduce points (every 30 seconds for performance)
  const sampleRate = 30;
  const chartData = [];
  for (let i = 0; i < timeData.length; i += sampleRate) {
    chartData.push({
      time: Math.round(timeData[i] / 60), // Convert to minutes
      watts: powerData[i] || null,
      hr: hrData[i] || null
    });
  }
  
  if (chartData.length === 0) return null;
  
  return (
    <div className="bg-gray-50 sm:rounded-lg sm:p-4 -mx-2 sm:mx-0">
      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2 px-2 sm:px-0">
        <Activity className="h-4 w-4" />
        Activity Overview
      </h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 0, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 10 }} 
              tickFormatter={(v) => `${v}m`}
            />
            <YAxis 
              yAxisId="watts" 
              orientation="left" 
              tick={{ fontSize: 10 }}
              domain={[0, 'auto']}
            />
            <YAxis 
              yAxisId="hr" 
              orientation="right" 
              tick={{ fontSize: 10 }}
              domain={[80, 200]}
            />
            <Tooltip 
              formatter={(value, name) => [value, name === 'watts' ? 'Power (W)' : 'HR (bpm)']}
              labelFormatter={(v) => `${v} min`}
            />
            <Area 
              yAxisId="watts"
              type="monotone" 
              dataKey="watts" 
              fill="#3b82f6" 
              fillOpacity={0.3}
              stroke="#3b82f6"
              strokeWidth={1}
              name="watts"
            />
            <Line 
              yAxisId="hr"
              type="monotone" 
              dataKey="hr" 
              stroke="#ef4444" 
              strokeWidth={2}
              dot={false}
              name="hr"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded" />
          <span>Power (W)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-1 bg-red-500 rounded" />
          <span>Heart Rate (bpm)</span>
        </div>
      </div>
    </div>
  );
};

export default ActivityChart;
