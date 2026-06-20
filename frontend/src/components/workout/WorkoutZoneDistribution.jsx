import { DEFAULT_POWER_ZONES, ZONE_COLORS, getZoneForPower } from '../../utils/zoneUtils';
import { flattenSteps } from '../../utils/workoutUtils';
import { formatDurationShort } from '../../utils/dataUtils';

const WorkoutZoneDistribution = ({ workoutDoc, totalTime, powerZones = DEFAULT_POWER_ZONES, layout = 'vertical' }) => {
  if (!workoutDoc?.steps) return null;

  const steps = flattenSteps(workoutDoc.steps);
  
  // Build zones object dynamically from powerZones
  const zones = {};
  powerZones.forEach(zone => {
    zones[zone.name] = 0;
  });
  
  let calculatedTotal = 0;

  steps.forEach(step => {
    const power = step.power?.value || step.power?.end || 50;
    const duration = step.duration || 0;
    calculatedTotal += duration;
    
    // Find matching zone based on power percentage
    const zone = getZoneForPower(power, powerZones);
    if (zone && zones[zone.name] !== undefined) {
      zones[zone.name] += duration;
    }
  });

  const total = totalTime || calculatedTotal;

  // Get zone color from powerZones or fallback to ZONE_COLORS
  const getZoneColor = (zoneName) => {
    const zone = powerZones.find(z => z.name === zoneName);
    if (zone?.color) {
      // Convert hex to tailwind-like class or use inline style
      return { hex: zone.color };
    }
    return ZONE_COLORS[zoneName] || { hex: '#9ca3af' };
  };

  if (layout === 'horizontal') {
    return (
      <div className="flex flex-wrap gap-4">
        {Object.entries(zones)
          .filter(([_, time]) => time > 0)
          .map(([zoneName, time]) => {
            const zoneColor = getZoneColor(zoneName);
            return (
              <div key={zoneName} className="flex items-center gap-2">
                <div className="w-8 h-4 rounded" style={{ backgroundColor: zoneColor.hex }} />
                <span className="font-medium text-sm">{zoneName}</span>
                <span className="text-sm text-gray-600">{formatDurationShort(time) || '-'}</span>
                <span className="text-xs text-gray-400">
                  {total > 0 ? `${Math.round((time / total) * 100)}%` : ''}
                </span>
              </div>
            );
          })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {Object.entries(zones)
        .filter(([_, time]) => time > 0)
        .map(([zoneName, time]) => {
          const zoneColor = getZoneColor(zoneName);
          return (
            <div key={zoneName} className="flex items-center gap-2 text-xs">
              <div className="w-6 h-3 rounded" style={{ backgroundColor: zoneColor.hex }} />
              <span className="w-6 font-medium">{zoneName}</span>
              <span className="text-gray-600">{formatDurationShort(time) || '-'}</span>
              <span className="text-gray-400">
                {total > 0 ? `${Math.round((time / total) * 100)}%` : ''}
              </span>
            </div>
          );
        })}
    </div>
  );
};

export default WorkoutZoneDistribution;
