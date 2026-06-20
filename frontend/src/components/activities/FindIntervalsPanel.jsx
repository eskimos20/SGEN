import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Search, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceArea } from 'recharts';
import api from '../../api/axios';

const SpinnerInput = ({ value, onChange, min = 0, max = 999, padStart = false, label }) => {
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const isTouchRef = useRef(false);

  const step = useCallback((dir) => {
    onChange(prev => {
      const next = prev + dir;
      if (next < min) return max;
      if (next > max) return min;
      return next;
    });
  }, [onChange, min, max]);

  const startPress = useCallback((dir) => {
    step(dir);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => step(dir), 200);
    }, 800);
  }, [step]);

  const stopPress = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearInterval(intervalRef.current);
  }, []);

  useEffect(() => () => stopPress(), [stopPress]);

  const display = padStart ? String(value).padStart(2, '0') : String(value);

  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && <span className="text-xs font-medium text-gray-600 self-start mb-0.5">{label}</span>}
      {/* Mobile: vertical spinner */}
      <div className="flex sm:hidden flex-col items-center border border-gray-300 rounded-lg overflow-hidden bg-white w-16">
        <button
          type="button"
          className="w-full h-9 flex items-center justify-center bg-gray-50 active:bg-gray-200 border-b border-gray-300 select-none touch-none"
          onMouseDown={() => { if (!isTouchRef.current) startPress(1); }}
          onMouseUp={stopPress}
          onMouseLeave={stopPress}
          onTouchStart={(e) => { e.preventDefault(); isTouchRef.current = true; startPress(1); }}
          onTouchEnd={() => { stopPress(); setTimeout(() => { isTouchRef.current = false; }, 300); }}
          onTouchCancel={() => { stopPress(); setTimeout(() => { isTouchRef.current = false; }, 300); }}
        >
          <ChevronUp className="h-4 w-4 text-gray-600" />
        </button>
        <div className="py-2 text-base font-semibold text-gray-900 text-center w-full select-none" style={{ fontSize: '18px' }}>
          {display}
        </div>
        <button
          type="button"
          className="w-full h-9 flex items-center justify-center bg-gray-50 active:bg-gray-200 border-t border-gray-300 select-none touch-none"
          onMouseDown={() => { if (!isTouchRef.current) startPress(-1); }}
          onMouseUp={stopPress}
          onMouseLeave={stopPress}
          onTouchStart={(e) => { e.preventDefault(); isTouchRef.current = true; startPress(-1); }}
          onTouchEnd={() => { stopPress(); setTimeout(() => { isTouchRef.current = false; }, 300); }}
          onTouchCancel={() => { stopPress(); setTimeout(() => { isTouchRef.current = false; }, 300); }}
        >
          <ChevronDown className="h-4 w-4 text-gray-600" />
        </button>
      </div>
      {/* Desktop: plain number input */}
      <input
        type="number"
        value={display}
        onChange={(e) => {
          const parsed = parseInt(e.target.value);
          if (!isNaN(parsed)) onChange(() => Math.max(min, Math.min(max, parsed)));
        }}
        className="hidden sm:block w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        style={{ fontSize: '16px' }}
        min={min}
        max={max}
      />
    </div>
  );
};

const FindIntervalsPanel = forwardRef(({ activityId, streams }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchType, setSearchType] = useState('watts');
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [intervalCount, setIntervalCount] = useState(3);
  const [isSearching, setIsSearching] = useState(false);
  const [efforts, setEfforts] = useState(null);
  const [error, setError] = useState(null);
  const [skipWarmup, setSkipWarmup] = useState(false);
  const [warmupMinutes, setWarmupMinutes] = useState(10);
  const [skipCooldown, setSkipCooldown] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState(10);

  // Parse streams data - handle both array and object formats
  let timeData = [];
  let powerData = [];
  let hrData = [];

  if (Array.isArray(streams)) {
    // Array format: [{type: 'time', data: [...]}, ...]
    const timeStream = streams.find(s => s.type === 'time');
    const wattsStream = streams.find(s => s.type === 'watts');
    const hrStream = streams.find(s => s.type === 'heartrate');
    timeData = timeStream?.data || [];
    powerData = wattsStream?.data || [];
    hrData = hrStream?.data || [];
  } else if (streams) {
    // Object format: handle both {time: {data: [...]}} and {time: [...]}
    timeData = Array.isArray(streams.time) ? streams.time : (streams.time?.data || []);
    powerData = Array.isArray(streams.watts) ? streams.watts : (streams.watts?.data || []);
    hrData = Array.isArray(streams.heartrate) ? streams.heartrate : (streams.heartrate?.data || []);
  }

  const hasPower = powerData.length > 0 && powerData.some(v => v > 0);
  const hasHR = hrData.length > 0 && hrData.some(v => v > 0);

  // Default searchType to available stream
  useEffect(() => {
    if (!hasPower && hasHR) setSearchType('heartrate');
    else if (hasPower) setSearchType('watts');
  }, [hasPower, hasHR]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    hasPendingEfforts: () => !!(efforts && efforts.length > 0),
    getPendingPayload: () => {
      if (!efforts || efforts.length === 0) return null;
      return efforts.map((effort, idx) => ({
        start_index: effort.start_index,
        end_index: effort.end_index,
        type: 'WORK',
        label: `${searchType === 'watts' ? 'Power' : 'HR'} #${idx + 1}`
      }));
    },
    getSearchDuration: () => (durationMinutes || 0) * 60 + (durationSeconds || 0),
    clearEfforts: () => setEfforts(null)
  }));

  // Filter out overlapping efforts - keep only non-overlapping intervals
  const filterNonOverlapping = (allEfforts, desiredCount) => {
    if (!allEfforts || allEfforts.length === 0) return [];
    // Efforts are sorted by average (descending) from the API
    const selected = [allEfforts[0]];
    for (let i = 1; i < allEfforts.length && selected.length < desiredCount; i++) {
      const effort = allEfforts[i];
      const overlaps = selected.some(s =>
        effort.start_index < s.end_index && effort.end_index > s.start_index
      );
      if (!overlaps) {
        selected.push(effort);
      }
    }
    return selected;
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setEfforts(null);

    const durationInSeconds = (durationMinutes || 0) * 60 + (durationSeconds || 0);
    if (durationInSeconds <= 0) return;

    try {
      // Use compute-intervals endpoint that calculates intervals locally from streams
      // Returns intervals in chronological order (by start time)
      const params = {
        stream: searchType,
        duration: durationInSeconds,
        count: intervalCount
      };
      if (skipWarmup && warmupMinutes > 0) {
        params.skipSeconds = warmupMinutes * 60;
      }
      if (skipCooldown && cooldownMinutes > 0) {
        params.cooldownSeconds = cooldownMinutes * 60;
      }
      const response = await api.get(`/statistics/activity/${activityId}/compute-intervals`, { params });
      const data = response.data;
      if (data.efforts && Array.isArray(data.efforts) && data.efforts.length > 0) {
        // Efforts are already sorted chronologically by the backend
        setEfforts(data.efforts);
      } else {
        setError('No intervals found for these criteria.');
      }
    } catch (err) {
      console.error('Find intervals error:', err);
      setError(err.response?.data?.error || 'Failed to search for intervals.');
    } finally {
      setIsSearching(false);
    }
  };

  const formatDurationLabel = (seconds) => {
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    return `${seconds}s`;
  };

  // Build chart data with highlighted efforts
  const buildChartData = () => {
    if (timeData.length === 0) return [];

    const sampleRate = Math.max(1, Math.floor(timeData.length / 600));
    const chartData = [];
    for (let i = 0; i < timeData.length; i += sampleRate) {
      chartData.push({
        time: Math.round(timeData[i] / 60 * 10) / 10,
        timeSeconds: timeData[i],
        watts: powerData[i] || null,
        hr: hrData[i] || null,
        index: i
      });
    }
    return chartData;
  };

  const chartData = isOpen ? buildChartData() : [];

  // Calculate total activity duration in minutes for minimum visual width
  const totalDurationMin = timeData.length > 0 ? (timeData[timeData.length - 1] || 0) / 60 : 1;
  const minVisualWidthMin = totalDurationMin * 0.015; // At least 1.5% of chart width

  const getEffortTimeRange = (effort, idx, allEfforts) => {
    const startTime = timeData[effort.start_index] || 0;
    const endTime = timeData[effort.end_index] || 0;
    let startMin = Math.round(startTime / 60 * 10) / 10;
    let endMin = Math.round(endTime / 60 * 10) / 10;
    
    // Ensure a minimum visual width so short intervals are visible
    if (endMin - startMin < minVisualWidthMin) {
      endMin = startMin + minVisualWidthMin;
    }
    
    // For short intervals (<60s) and HR searches, ensure visual separation
    const isShortInterval = (endTime - startTime) < 60;
    const isHRSearch = searchType === 'heartrate';
    
    if (isShortInterval && isHRSearch && idx > 0) {
      // Simple separation: add index-based offset for HR short intervals
      const offset = idx * minVisualWidthMin * 0.5;
      startMin = startMin + offset;
      endMin = endMin + offset;
    }
    
    return { startMin, endMin };
  };

  const EFFORT_COLORS = [
    'rgba(34, 197, 94, 0.30)',
    'rgba(249, 115, 22, 0.30)',
    'rgba(168, 85, 247, 0.30)',
    'rgba(236, 72, 153, 0.30)',
    'rgba(20, 184, 166, 0.30)',
    'rgba(245, 158, 11, 0.30)',
    'rgba(99, 102, 241, 0.30)',
    'rgba(6, 182, 212, 0.30)',
  ];

  if (!activityId || timeData.length === 0) return null;
  if (!hasPower && !hasHR) return null;

  return (
    <div className="pt-3 mt-1 border-t border-gray-200">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Search className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="text-xs font-medium text-gray-800">Find Intervals</span>
          <span className="text-[10px] text-gray-400 hidden sm:inline truncate">Search for best efforts in this activity</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* Search by stream type */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Search by</label>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              {hasPower && (
                <button
                  onClick={() => { setSearchType('watts'); setEfforts(null); setError(null); }}
                  className={`py-1.5 px-4 text-xs font-medium transition-colors ${
                    searchType === 'watts'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Power
                </button>
              )}
              {hasHR && (
                <button
                  onClick={() => { setSearchType('heartrate'); setEfforts(null); setError(null); }}
                  className={`py-1.5 px-4 text-xs font-medium transition-colors border-l border-gray-200 ${
                    searchType === 'heartrate'
                      ? 'bg-red-500 text-white border-l-transparent'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Heart Rate
                </button>
              )}
            </div>
          </div>

          {/* Number of intervals + Duration + Search */}
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <div className="flex-shrink-0">
              <SpinnerInput
                label="Intervals"
                value={intervalCount}
                onChange={(fn) => setIntervalCount(typeof fn === 'function' ? fn(intervalCount) : fn)}
                min={1}
                max={20}
              />
            </div>
            <div className="flex-shrink-0">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Duration (mm:ss)</label>
              <div className="flex items-center gap-1">
                <SpinnerInput
                  value={durationMinutes}
                  onChange={(fn) => setDurationMinutes(typeof fn === 'function' ? fn(durationMinutes) : fn)}
                  min={0}
                  max={999}
                />
                <span className="text-gray-500 font-bold text-sm">:</span>
                <SpinnerInput
                  value={durationSeconds}
                  onChange={(fn) => setDurationSeconds(typeof fn === 'function' ? fn(durationSeconds) : fn)}
                  min={0}
                  max={59}
                  padStart
                />
              </div>
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || ((durationMinutes || 0) * 60 + (durationSeconds || 0) <= 0)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm font-medium whitespace-nowrap flex-shrink-0"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </button>
          </div>

          {/* Skip Warmup Option */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipWarmup}
                onChange={(e) => setSkipWarmup(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Skip warmup</span>
            </label>
            {skipWarmup && (
              <div className="flex items-center gap-2">
                <SpinnerInput
                  value={warmupMinutes}
                  onChange={(fn) => setWarmupMinutes(typeof fn === 'function' ? fn(warmupMinutes) : fn)}
                  min={0}
                  max={999}
                />
                <span className="text-xs text-gray-500">minutes</span>
              </div>
            )}
          </div>

          {/* Skip Cooldown Option */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipCooldown}
                onChange={(e) => setSkipCooldown(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Skip cooldown</span>
            </label>
            {skipCooldown && (
              <div className="flex items-center gap-2">
                <SpinnerInput
                  value={cooldownMinutes}
                  onChange={(fn) => setCooldownMinutes(typeof fn === 'function' ? fn(cooldownMinutes) : fn)}
                  min={0}
                  max={999}
                />
                <span className="text-xs text-gray-500">minutes</span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5 border border-red-100">{error}</div>
          )}

          {/* Results */}
          {efforts && efforts.length > 0 && chartData.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-gray-700">
                  Found {efforts.length} best {searchType === 'watts' ? 'power' : 'HR'} interval{efforts.length > 1 ? 's' : ''}{' '}
                  <span className="text-gray-400 font-normal">
                    ({formatDurationLabel((durationMinutes || 0) * 60 + (durationSeconds || 0))} each)
                  </span>
                </h4>
                <button
                  onClick={() => setEfforts(null)}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                  title="Clear results"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>

              {/* Chart */}
              <div className="bg-white rounded-lg p-2">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${Math.round(v)}m`}
                      />
                      {hasPower && (
                        <YAxis
                          yAxisId="watts"
                          orientation="left"
                          tick={{ fontSize: 10 }}
                          domain={[0, 'auto']}
                        />
                      )}
                      {hasHR && (
                        <YAxis
                          yAxisId="hr"
                          orientation={hasPower ? 'right' : 'left'}
                          tick={{ fontSize: 10 }}
                          domain={[0, 'dataMax + 20']}
                        />
                      )}
                      <Tooltip
                        formatter={(value, name) => [
                          Math.round(value),
                          name === 'watts' ? 'Power (W)' : 'HR (bpm)'
                        ]}
                        labelFormatter={(v) => `${v} min`}
                      />
                      {hasPower && (
                        <Area
                          yAxisId="watts"
                          type="monotone"
                          dataKey="watts"
                          fill="#3b82f6"
                          fillOpacity={0.2}
                          stroke="#3b82f6"
                          strokeWidth={1}
                          name="watts"
                        />
                      )}
                      {hasHR && (
                        <Line
                          yAxisId="hr"
                          type="monotone"
                          dataKey="hr"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={false}
                          name="hr"
                        />
                      )}
                      {efforts.map((effort, idx) => {
                        const { startMin, endMin } = getEffortTimeRange(effort, idx, efforts);
                        return (
                          <ReferenceArea
                            key={idx}
                            yAxisId={searchType === 'watts' ? 'watts' : 'hr'}
                            x1={startMin}
                            x2={endMin}
                            fill={EFFORT_COLORS[idx % EFFORT_COLORS.length]}
                            stroke={EFFORT_COLORS[idx % EFFORT_COLORS.length].replace('0.30', '0.9')}
                            strokeWidth={2}
                          />
                        );
                      })}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-3 mt-1.5 text-[10px] text-gray-500">
                  {hasPower && (
                    <div className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 bg-blue-500 rounded-lg" />
                      <span>Power</span>
                    </div>
                  )}
                  {hasHR && (
                    <div className="flex items-center gap-1">
                      <div className="w-2.5 h-0.5 bg-red-500 rounded" />
                      <span>Heart Rate</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 bg-green-400/40 rounded-lg border border-green-500/50" />
                    <span>Best intervals</span>
                  </div>
                </div>
              </div>

              {/* Efforts table */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1.5 px-2 font-medium text-gray-500">#</th>
                    <th className="text-right py-1.5 px-2 font-medium text-gray-500">
                      Avg {searchType === 'watts' ? 'W' : 'bpm'}
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium text-gray-500">Duration</th>
                    <th className="text-right py-1.5 px-2 font-medium text-gray-500">Start</th>
                  </tr>
                </thead>
                <tbody>
                  {efforts.map((effort, idx) => {
                    const startTimeSec = timeData[effort.start_index] || 0;
                    return (
                      <tr key={idx} className="border-b border-gray-100 last:border-b-0">
                        <td className="py-1.5 px-2">
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded text-white text-[10px] font-bold"
                            style={{ backgroundColor: EFFORT_COLORS[idx % EFFORT_COLORS.length].replace('0.25', '0.7') }}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold text-gray-900">
                          {Math.round(effort.average)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-gray-500">
                          {formatDurationLabel(effort.duration)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-gray-500">
                          {formatDurationLabel(Math.round(startTimeSec))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p className="text-[10px] text-blue-600 italic">These intervals will be applied when you click Save</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

FindIntervalsPanel.displayName = 'FindIntervalsPanel';

export default FindIntervalsPanel;
