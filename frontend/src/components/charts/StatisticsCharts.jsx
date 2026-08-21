import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Zap, Heart, BarChart2, TrendingUp, ChevronUp, ChevronDown } from 'lucide-react';
import { formatHoursMinutes } from '../../utils/dataUtils';

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

  if (!weeklyData) return null;

  const zoneColors = ['#9ca3af', '#3b82f6', '#10b981', '#eab308', '#f59e0b', '#ef4444', '#8b5cf6'];

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
                <div>
                  <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-1">
                    <Zap className="h-4 w-4" /> FTP Top 3
                  </h3>
                  <div className="space-y-3">
                    {top3Ftp.map((result) => (
                      <div key={result.id} className="border-l-4 border-amber-500 pl-4 py-2 bg-amber-50 rounded-r">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-600">Rank {result.rank}</span>
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
                </div>
              )}
              {/* VO2Max */}
              {top3Vo2Max.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-1">
                    <Heart className="h-4 w-4" /> VO2Max Top 3
                  </h3>
                  <div className="space-y-3">
                    {top3Vo2Max.map((result) => (
                      <div key={result.id} className="border-l-4 border-red-500 pl-4 py-2 bg-red-50 rounded-r">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-600">Rank {result.rank}</span>
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
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Activity Type + HR Zones + Pwr Zones (one card) ── */}
      <div className="card-mobile">
        <SectionHeader
          title="Activity Type Breakdown & Zone Distribution"
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
                            return <Cell key={`cell-${index}`} fill={zoneColors[zoneIdx] || COLORS[index]} />;
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
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zoneColors[zoneIdx] }} />
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
                            <Cell key={`cell-${index}`} fill={zoneColors[index] || COLORS[index]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {weeklyData.powerZoneBreakdown.map((zone, idx) => (
                      <div key={zone.name} className="flex items-center gap-1 text-xs">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zoneColors[idx] }} />
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
