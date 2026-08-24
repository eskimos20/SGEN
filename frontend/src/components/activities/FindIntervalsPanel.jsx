import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Search, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react';
import NumberInput from '../shared/NumberInput';
import RangeSlider from '../ui/RangeSlider';
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceArea } from 'recharts';
import api from '../../api/axios';

const intervalCls = "w-20 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center";
const durationCls = "w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center";

const FindIntervalsPanel = forwardRef(({ activityId, streams }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchType, setSearchType] = useState('watts');
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [intervalCount, setIntervalCount] = useState(3);
  const [isSearching, setIsSearching] = useState(false);
  const [efforts, setEfforts] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState({ min: 0, max: 0 });

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
      const skipSeconds = Math.round(searchStartMin * 60);
      const cooldownSeconds = Math.round((totalDurationMin - searchEndMin) * 60);
      if (skipSeconds > 0) {
        params.skipSeconds = skipSeconds;
      }
      if (cooldownSeconds > 0) {
        params.cooldownSeconds = cooldownSeconds;
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

    const sampleRate = 30; // one point per 30 s, matching the standard Activity Overview
    const chartData = [];
    for (let i = 0; i < timeData.length; i += sampleRate) {
      chartData.push({
        time: Math.round(timeData[i] / 60 * 10) / 10,
        watts: powerData[i] || null,
        hr: hrData[i] || null
      });
    }
    return chartData;
  };

  const chartData = isOpen ? buildChartData() : [];

  // Calculate total activity duration in minutes for minimum visual width
  const totalDurationMin = timeData.length > 0 ? (timeData[timeData.length - 1] || 0) / 60 : 1;
  const searchStartMin = range.min || 0;
  const searchEndMin = range.max > 0 ? range.max : Math.round(totalDurationMin);
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
          <div className="flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-3">
            <div className="flex-shrink-0">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Intervals</label>
              <NumberInput
                value={intervalCount}
                onChange={(e) => setIntervalCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                min={1}
                max={20}
                className={intervalCls}
                style={{ fontSize: '16px' }}
                sublabel="Intervals"
                wrapperClassName="w-20"
              />
            </div>
            <div className="flex-shrink-0">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Duration (mm:ss)</label>
              <div className="flex items-center gap-1">
                <NumberInput
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(0, Math.min(999, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={999}
                  className={durationCls}
                  style={{ fontSize: '16px' }}
                  sublabel="Minutes"
                  wrapperClassName="w-20"
                />
                <span className="text-gray-500 font-bold text-sm mb-3">:</span>
                <NumberInput
                  value={String(durationSeconds).padStart(2, '0')}
                  onChange={(e) => setDurationSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={59}
                  className={durationCls}
                  style={{ fontSize: '16px' }}
                  sublabel="Seconds"
                  wrapperClassName="w-20"
                />
              </div>
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || ((durationMinutes || 0) * 60 + (durationSeconds || 0) <= 0)}
              className="px-4 py-2 sm:mt-5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm font-medium whitespace-nowrap flex-shrink-0"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </button>
          </div>

          {/* Activity range */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600 block">Activity range</label>
              <span className="text-[10px] text-gray-500">Drag the handles to skip warmup/cooldown</span>
            </div>
            <RangeSlider
              min={0}
              max={Math.round(totalDurationMin)}
              valueMin={searchStartMin}
              valueMax={searchEndMin}
              onChange={setRange}
              step={1}
              hideInputs
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5 border border-red-100">{error}</div>
          )}

          {/* Activity Overview */}
          {isOpen && chartData.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                {efforts && efforts.length > 0 ? (
                  <h4 className="text-xs font-medium text-gray-700">
                    Found {efforts.length} best {searchType === 'watts' ? 'power' : 'HR'} interval{efforts.length > 1 ? 's' : ''}{' '}
                    <span className="text-gray-400 font-normal">
                      ({formatDurationLabel((durationMinutes || 0) * 60 + (durationSeconds || 0))} each)
                    </span>
                  </h4>
                ) : (
                  <h4 className="text-xs font-medium text-gray-700">Activity Overview</h4>
                )}
                {efforts && efforts.length > 0 && (
                  <button
                    onClick={() => setEfforts(null)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                    title="Clear results"
                  >
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                )}
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
                        domain={[0, Math.round(totalDurationMin)]}
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
                          fillOpacity={0.3}
                          stroke="#3b82f6"
                          strokeWidth={1}
                          connectNulls
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
                          connectNulls
                          name="hr"
                        />
                      )}
                      {searchStartMin > 0 && (
                        <ReferenceArea
                          yAxisId={searchType === 'watts' ? 'watts' : 'hr'}
                          x1={0}
                          x2={searchStartMin}
                          fill="rgba(71, 85, 105, 0.35)"
                        />
                      )}
                      {searchEndMin < Math.round(totalDurationMin) && (
                        <ReferenceArea
                          yAxisId={searchType === 'watts' ? 'watts' : 'hr'}
                          x1={searchEndMin}
                          x2={Math.round(totalDurationMin)}
                          fill="rgba(71, 85, 105, 0.35)"
                        />
                      )}
                      {efforts?.map((effort, idx) => {
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

              {efforts && efforts.length > 0 && ( <>
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
              </>
            )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

FindIntervalsPanel.displayName = 'FindIntervalsPanel';

export default FindIntervalsPanel;
