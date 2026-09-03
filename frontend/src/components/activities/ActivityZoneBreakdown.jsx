import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Zap, Heart } from 'lucide-react';
import { calculateActivityZones } from '../../utils/zoneUtils';
import { formatHoursMinutes } from '../../utils/dataUtils';

const ActivityZoneBreakdown = ({ activity, athleteProfile, streams }) => {
  const { powerZoneBreakdown, hrZoneBreakdown, hasPower, hasHR } = useMemo(() => {
    const sportSettings = athleteProfile?.athlete?.sportSettings;
    return calculateActivityZones(activity, sportSettings, streams);
  }, [activity, athleteProfile, streams]);

  if (!hasPower && !hasHR) return null;

  return (
    <div className="bg-gray-50 sm:rounded-lg sm:p-4 -mx-2 sm:mx-0 mt-3">
      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2 px-2 sm:px-0">
        <Zap className="h-4 w-4" />
        Zone Distribution
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {hasPower && (
          <div>
            <h5 className="text-sm font-semibold text-gray-900 mb-3 text-center">
              Time in Power Zones
            </h5>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={powerZoneBreakdown}
                    dataKey="time"
                    nameKey="shortName"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {powerZoneBreakdown.map((entry, index) => (
                      <Cell key={`power-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatHoursMinutes(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {powerZoneBreakdown.map((zone) => (
                <div key={zone.shortName} className="flex items-center gap-1 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zone.color }} />
                  <span>{zone.shortName} ({zone.percent}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasHR && (
          <div>
            <h5 className="text-sm font-semibold text-gray-900 mb-3 text-center">
              Time in HR Zones
            </h5>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={hrZoneBreakdown}
                    dataKey="time"
                    nameKey="shortName"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {hrZoneBreakdown.map((entry, index) => (
                      <Cell key={`hr-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatHoursMinutes(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {hrZoneBreakdown.map((zone) => (
                <div key={zone.shortName} className="flex items-center gap-1 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zone.color }} />
                  <span>{zone.shortName} ({zone.percent}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityZoneBreakdown;
