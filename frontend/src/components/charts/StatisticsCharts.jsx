import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { Zap, Heart, BarChart2, TrendingUp, ChevronUp, ChevronDown } from 'lucide-react';
import PowerCurveHistoryChart from './PowerCurveHistoryChart';
import { formatHoursMinutes } from '../../utils/dataUtils';
import { ZONE_COLOR_HEX } from '../../utils/zoneUtils';

const SectionHeader = ({ title, icon, expanded, onToggle }) => (
  <div
    className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity mb-4"
    onClick={onToggle}
  >
    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
      {icon}
      {title}
    </h2>
    {expanded ? <ChevronUp className="h-5 w-5 text-gray-600" /> : <ChevronDown className="h-5 w-5 text-gray-600" />}
  </div>
);

const StatisticsCharts = ({
  weeklyData,
  top3Ftp,
  top3Vo2Max,
  powerRecords,
  paceRecords,
  bestPowerCurve,
  COLORS,
  athleteProfile
}) => {
  const [isPerformanceExpanded, setIsPerformanceExpanded] = useState(() => {
    const saved = localStorage.getItem('statistics-performanceExpanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [isZonesExpanded, setIsZonesExpanded] = useState(() => {
    const saved = localStorage.getItem('statistics-zonesExpanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [isWeeklyExpanded, setIsWeeklyExpanded] = useState(() => {
    const saved = localStorage.getItem('statistics-weeklyExpanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [isRecordsExpanded, setIsRecordsExpanded] = useState(() => {
    const saved = localStorage.getItem('statistics-recordsExpanded');
    return saved !== null ? saved === 'true' : true;
  });

  const togglePerformance = () => {
    const next = !isPerformanceExpanded;
    setIsPerformanceExpanded(next);
    localStorage.setItem('statistics-performanceExpanded', next.toString());
  };
  const toggleZones = () => {
    const next = !isZonesExpanded;
    setIsZonesExpanded(next);
    localStorage.setItem('statistics-zonesExpanded', next.toString());
  };
  const toggleWeekly = () => {
    const next = !isWeeklyExpanded;
    setIsWeeklyExpanded(next);
    localStorage.setItem('statistics-weeklyExpanded', next.toString());
  };
  const toggleRecords = () => {
    const next = !isRecordsExpanded;
    setIsRecordsExpanded(next);
    localStorage.setItem('statistics-recordsExpanded', next.toString());
  };

  if (!weeklyData) return null;

  const durationLabel = (secs) => {
    const labels = { 1: '1s', 5: '5s', 15: '15s', 30: '30s', 60: '1m', 120: '2m', 180: '3m', 240: '4m', 300: '5m', 480: '8m', 600: '10m', 720: '12m', 900: '15m', 1200: '20m', 1800: '30m', 2400: '40m', 3600: '60m' };
    return labels[secs] || `${Math.round(secs / 60)}m`;
  };
  const distanceLabel = (m) => {
    const labels = { 400: '400m', 1000: '1 km', 1609: '1 mi', 5000: '5 km', 10000: '10 km', 21097: 'Half marathon', 42195: 'Marathon' };
    return labels[m] || `${(m / 1000).toFixed(1)} km`;
  };
  const formatSecPerKm = (secKm) => {
    if (!secKm || secKm <= 0) return '-';
    const mm = Math.floor(secKm / 60);
    const ss = Math.round(secKm % 60).toString().padStart(2, '0');
    return `${mm}:${ss} /km`;
  };
  const sportColors = (sport) => {
    const colors = { Ride: '#f97316', VirtualRide: '#8b5cf6', Run: '#3b82f6', TrailRun: '#06b6d4', VirtualRun: '#06b6d4', Swim: '#0ea5e9', NordicSki: '#10b981', VirtualSki: '#10b981', Hike: '#84cc16', Walk: '#84cc16' };
    return colors[sport] || '#10b981';
  };

  // Merged all-time curve: one continuous line per metric — best power
  // per duration (left y, watts) and best pace per distance (right y,
  // seconds/km reversed). All run types are merged into one pace line.
  const recordsChart = (() => {
    const durations = new Set((powerRecords || []).map(r => r.durationS));
    const distances = new Set((paceRecords || []).map(r => r.distanceM));
    const xs = [...new Set([...durations, ...distances])].sort((a, b) => a - b);
    const data = xs.map(x => {
      const point = { x, xLabel: distances.has(x) ? distanceLabel(x) : durationLabel(x) };
      const power = (powerRecords || []).find(r => r.durationS === x);
      if (power) point.watts = power.watts;
      const pace = (paceRecords || []).find(r => r.distanceM === x);
      if (pace) point.secKm = 1000 / pace.paceMps;
      return point;
    });
    let wattsMax = 0, secKmMax = 0;
    data.forEach(p => {
      if (p.watts > wattsMax) wattsMax = p.watts;
      if (p.secKm > secKmMax) secKmMax = p.secKm;
    });
    return {
      data,
      wattsMax: Math.ceil(wattsMax / 50) * 50 + 20,
      secKmMax: Math.ceil(secKmMax / 30) * 30 + 15
    };
  })();

  // Single merged top-3 lists (indoor and outdoor compete together)
  const ftpTop3 = [...(top3Ftp || [])].sort((a, b) => b.ftpValue - a.ftpValue);
  const vo2Top3 = [...(top3Vo2Max || [])].sort((a, b) => b.vo2MaxValue - a.vo2MaxValue);

  const indoorBadge = (result) => (result.indoor ? '🏠 Indoor' : '🌳 Outdoor');

  const renderFtpList = (list) => (
    <div className="space-y-3">
      {list.map((result, index) => (
        <div key={result.id} className="border-l-4 border-amber-500 pl-4 py-2 bg-amber-50 rounded-r">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-600">{indoorBadge(result)} · Rank {index + 1}</span>
            <span className="text-2xl font-bold text-amber-700">{Math.round(result.ftpValue)} W</span>
          </div>
          <div className="text-sm text-gray-700 font-medium">{result.activityName}</div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1 text-xs text-gray-600">
            <div className="flex items-center gap-4">
              <span>{result.activityType}</span>
              <span>{result.activityDate}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Avg: {Math.round(result.averageWatts)} W</span>
              <span>Duration: {Math.floor(result.basisDurationSeconds / 60)}:{(result.basisDurationSeconds % 60).toString().padStart(2, '0')} min</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderVo2MaxList = (list) => (
    <div className="space-y-3">
      {list.map((result, index) => (
        <div key={result.id} className="border-l-4 border-red-500 pl-4 py-2 bg-red-50 rounded-r">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-600">{indoorBadge(result)} · Rank {index + 1}</span>
            <span className="text-2xl font-bold text-red-700">{result.vo2MaxValue} ml/kg/min</span>
          </div>
          <div className="text-sm text-gray-700 font-medium">{result.activityName}</div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1 text-xs text-gray-600">
            <div className="flex items-center gap-4">
              <span>{result.activityType}</span>
              <span>{result.activityDate}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Avg: {Math.round(result.averageWatts)} W</span>
              <span>Duration: {Math.floor(result.durationSeconds / 60)}:{(result.durationSeconds % 60).toString().padStart(2, '0')} min</span>
            </div>
          </div>
          {result.rating && (
            <div className="mt-1 text-xs font-medium text-red-700">{result.rating} based on age group and gender</div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── FTP Top 3 + VO2Max Top 3 (one card) ── */}
      {(top3Ftp.length > 0 || top3Vo2Max.length > 0) && (
        <div className="card-mobile">
          <SectionHeader
            title="Top 3 VO2Max & FTP"
            icon={<><Zap className="h-5 w-5 text-amber-600" /><Heart className="h-5 w-5 text-red-600" /></>}
            expanded={isPerformanceExpanded}
            onToggle={togglePerformance}
          />
          {isPerformanceExpanded && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* FTP */}
              {top3Ftp.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-1">
                    <Zap className="h-4 w-4" /> FTP Top 3
                  </h3>
                  {renderFtpList(ftpTop3)}
                </div>
              )}
              {/* VO2Max */}
              {top3Vo2Max.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-red-700 flex items-center gap-1">
                    <Heart className="h-4 w-4" /> VO2Max Top 3
                  </h3>
                  {renderVo2MaxList(vo2Top3)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Power Curve Best All Time: records as curves ── */}
      {((bestPowerCurve || []).length > 0 || (paceRecords || []).length > 0) && (
        <div className="card-mobile">
          <SectionHeader
            title="Best All Time Power/Pace Curve"
            icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
            expanded={isRecordsExpanded}
            onToggle={toggleRecords}
          />
          {isRecordsExpanded && (
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={recordsChart.data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="x"
                    scale="log"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => recordsChart.data.find(p => p.x === v)?.xLabel || v}
                    type="number"
                    stroke="#6b7280"
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="watts"
                    domain={[0, recordsChart.wattsMax]}
                    tickFormatter={(v) => `${v}W`}
                    stroke="#f97316"
                    fontSize={10}
                    tickLine={false}
                    width={45}
                  />
                  <YAxis
                    yAxisId="pace"
                    orientation="right"
                    reversed
                    domain={[0, recordsChart.secKmMax]}
                    tickFormatter={formatSecPerKm}
                    stroke="#10b981"
                    fontSize={10}
                    tickLine={false}
                    width={55}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
                            <div className="font-medium mb-1">{data.xLabel}</div>
                            {payload.filter(p => p.value != null).map((p, idx) => {
                              const isPace = p.dataKey === 'secKm';
                              return (
                                <div key={idx} className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                  <span style={{ color: p.color }}>
                                    {isPace ? `Best Pace: ${formatSecPerKm(p.value)}` : `Best Power: ${Math.round(p.value)}W`}
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
                  <Line
                    yAxisId="watts"
                    type="monotone"
                    dataKey="watts"
                    name="Best Power"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={true}
                  />
                  <Line
                    yAxisId="pace"
                    type="monotone"
                    dataKey="secKm"
                    name="Best Pace"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3 }}
                    connectNulls={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Activity Type + HR Zones + Pwr Zones (one card) ── */}
      <div className="card-mobile">
        <SectionHeader
          title="Period Activity Breakdown & Zone Distribution"
          icon={<BarChart2 className="h-5 w-5 text-blue-600" />}
          expanded={isZonesExpanded}
          onToggle={toggleZones}
        />
        {isZonesExpanded && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Activity Type */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Activity Type Breakdown</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={weeklyData.typeBreakdown.map(t => ({ ...t, hours: Math.round(t.time / 3600 * 10) / 10 }))}
                      dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    >
                      {weeklyData.typeBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatHoursMinutes(value, true)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {weeklyData.typeBreakdown.map((type, idx) => (
                  <div key={type.name} className="flex items-center gap-1 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span>{type.name} ({type.count})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* HR Zones */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Time in HR Zones</h3>
              {weeklyData.hrZoneBreakdown && weeklyData.hrZoneBreakdown.length > 0 ? (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={weeklyData.hrZoneBreakdown} dataKey="percent" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                          {weeklyData.hrZoneBreakdown.map((entry, index) => {
                            const zoneIdx = parseInt(entry.name.charAt(1)) - 1;
                            return <Cell key={`cell-${index}`} fill={ZONE_COLOR_HEX[zoneIdx] || COLORS[index]} />;
                          })}
                        </Pie>
                        <Tooltip formatter={(value) => `${value}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {weeklyData.hrZoneBreakdown.map((zone) => {
                      const zoneIdx = parseInt(zone.name.charAt(1)) - 1;
                      return (
                        <div key={zone.name} className="flex items-center gap-1 text-xs">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ZONE_COLOR_HEX[zoneIdx] }} />
                          <span>{zone.name} ({zone.percent}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <p>No HR zone data available</p>
                    <p className="text-sm mt-1">Activities with heart rate data will appear here</p>
                  </div>
                </div>
              )}
            </div>

            {/* Power Zones */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Time in Pwr Zones</h3>
              {weeklyData.powerZoneBreakdown && weeklyData.powerZoneBreakdown.length > 0 ? (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={weeklyData.powerZoneBreakdown} dataKey="percent" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                          {weeklyData.powerZoneBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={ZONE_COLOR_HEX[index] || COLORS[index]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {weeklyData.powerZoneBreakdown.map((zone, idx) => (
                      <div key={zone.name} className="flex items-center gap-1 text-xs">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ZONE_COLOR_HEX[idx] }} />
                        <span>{zone.name} ({zone.percent}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <p>No power zone data available</p>
                    <p className="text-sm mt-1">Activities with power data will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Weekly Training Volume (one card) ── */}
      <div className="card-mobile">
        <SectionHeader
          title="Weekly Training Volume"
          icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
          expanded={isWeeklyExpanded}
          onToggle={toggleWeekly}
        />
        {isWeeklyExpanded && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData.weeks} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name, props) => {
                    const weekData = props.payload;
                    return [
                      `${formatHoursMinutes(weekData.hours, true)} / ${Math.round(weekData.load)} load`,
                      'Weekly Volume'
                    ];
                  }}
                />
                <Bar dataKey="hours" fill="#3b82f6" name="Hours" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

    </div>
  );
};

export default React.memo(StatisticsCharts);
