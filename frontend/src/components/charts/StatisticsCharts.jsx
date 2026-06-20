import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Zap, Heart, ChevronUp, ChevronDown } from 'lucide-react';
import { formatHoursMinutes } from '../../utils/dataUtils';

const StatisticsCharts = ({
  weeklyData,
  top3Ftp,
  top3Vo2Max,
  COLORS,
  isFtpExpanded,
  setIsFtpExpanded,
  isVo2MaxExpanded,
  setIsVo2MaxExpanded,
  athleteProfile
}) => {
  if (!weeklyData) return null;

  return (
    <div className="space-y-6">
      {/* Top 3 FTP and VO2Max */}
      {(top3Ftp.length > 0 || top3Vo2Max.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* FTP Statistics Top 3 */}
          {top3Ftp.length > 0 && (
            <div className="card-mobile">
              <div 
                className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity mb-4"
                onClick={() => setIsFtpExpanded(!isFtpExpanded)}
              >
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-600" />
                  FTP Top 3
                </h2>
                {isFtpExpanded ? (
                  <ChevronUp className="h-5 w-5 text-gray-600" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-600" />
                )}
              </div>
              
              {isFtpExpanded && (
                <div className="space-y-4">
                  {top3Ftp.map((result, idx) => (
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
              )}
            </div>
          )}

          {/* VO2Max Statistics Top 3 */}
          {top3Vo2Max.length > 0 && (
            <div className="card-mobile">
              <div 
                className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity mb-4"
                onClick={() => setIsVo2MaxExpanded(!isVo2MaxExpanded)}
              >
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Heart className="h-5 w-5 text-red-600" />
                  VO2Max Top 3
                </h2>
                {isVo2MaxExpanded ? (
                  <ChevronUp className="h-5 w-5 text-gray-600" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-600" />
                )}
              </div>
              
              {isVo2MaxExpanded && (
                <div className="space-y-4">
                  {top3Vo2Max.map((result, idx) => (
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
              )}
            </div>
          )}
        </div>
      )}

      {/* Weekly Summary with Charts */}
      <div className="space-y-6">
        {/* Activity Type & HR Zone & Power Zone Pie Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Activity Type Breakdown - Pie Chart */}
          <div className="card-mobile">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Type Breakdown</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={weeklyData.typeBreakdown.map(t => ({ ...t, hours: Math.round(t.time / 3600 * 10) / 10 }))}
                    dataKey="hours"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
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

          {/* HR Zone Breakdown - Pie Chart */}
          <div className="card-mobile">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Time in HR Zones</h2>
            {weeklyData.hrZoneBreakdown && weeklyData.hrZoneBreakdown.length > 0 ? (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={weeklyData.hrZoneBreakdown}
                        dataKey="percent"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                      >
                        {weeklyData.hrZoneBreakdown.map((entry, index) => {
                          // Zone-specific colors for 7 zones
                          const zoneColors = ['#9ca3af', '#3b82f6', '#10b981', '#eab308', '#f59e0b', '#ef4444', '#8b5cf6'];
                          const zoneIdx = parseInt(entry.name.charAt(1)) - 1;
                          return <Cell key={`cell-${index}`} fill={zoneColors[zoneIdx] || COLORS[index]} />;
                        })}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {weeklyData.hrZoneBreakdown.map((zone, idx) => {
                    const zoneColors = ['#9ca3af', '#3b82f6', '#10b981', '#eab308', '#f59e0b', '#ef4444', '#8b5cf6'];
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

          {/* Power Zone Breakdown - Pie Chart */}
          <div className="card-mobile">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Time in Pwr Zones</h2>
            {weeklyData.powerZoneBreakdown && weeklyData.powerZoneBreakdown.length > 0 ? (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={weeklyData.powerZoneBreakdown}
                        dataKey="percent"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                      >
                        {weeklyData.powerZoneBreakdown.map((entry, index) => {
                          // Use same colors as HR zones for consistency
                          const zoneColors = ['#9ca3af', '#3b82f6', '#10b981', '#eab308', '#f59e0b', '#ef4444', '#8b5cf6'];
                          // Use array index instead of parsing zone name
                          const zoneIdx = index;
                          return <Cell key={`cell-${index}`} fill={zoneColors[zoneIdx] || COLORS[index]} />;
                        })}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {weeklyData.powerZoneBreakdown.map((zone, idx) => {
                    // Use same colors as HR zones for consistency
                    const zoneColors = ['#9ca3af', '#3b82f6', '#10b981', '#eab308', '#f59e0b', '#ef4444', '#8b5cf6'];
                    // Use array index instead of parsing zone name
                    const zoneIdx = idx;
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
                  <p>No power zone data available</p>
                  <p className="text-sm mt-1">Activities with power data will appear here</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weekly Volume Bar Chart */}
        <div className="card-mobile">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Weekly Training Volume</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData.weeks} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="week" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
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
        </div>
      </div>
    </div>
  );
};

export default React.memo(StatisticsCharts);
