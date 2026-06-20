import React, { useState, useMemo, useCallback } from 'react';
import { getZoneColorForPower, DEFAULT_POWER_ZONES } from '../../utils/zoneUtils';
import { flattenSteps } from '../../utils/workoutUtils';
import { formatDurationWithSeconds } from '../../utils/dataUtils';

// Get power value from step (handles ramps)
const getPower = (step) => {
  if (step.power?.value) return step.power.value;
  if (step.power?.start && step.power?.end) {
    return (step.power.start + step.power.end) / 2;
  }
  return step.power?.end || 50;
};

const WorkoutChart = ({ workoutDoc, ftp = 280, powerZones = DEFAULT_POWER_ZONES, height = 'h-24', showTooltip = true }) => {
  const [hoveredStep, setHoveredStep] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  if (!workoutDoc?.steps) return null;

  // Memoize expensive calculations
  const { steps, maxPower, totalDuration, stepsWithTime } = useMemo(() => {
    const steps = flattenSteps(workoutDoc.steps);
    const maxPower = Math.max(...steps.map(s => getPower(s)), 100);
    const totalDuration = steps.reduce((sum, s) => sum + (s.duration || 60), 0);

    // Calculate cumulative time for each step
    let cumulativeTime = 0;
    const stepsWithTime = steps.map(step => {
      const startTime = cumulativeTime;
      cumulativeTime += step.duration || 60;
      return { ...step, startTime, endTime: cumulativeTime };
    });

    return { steps, maxPower, totalDuration, stepsWithTime };
  }, [workoutDoc.steps]);

  const handleMouseEnter = useCallback((step, idx, event) => {
    if (!showTooltip) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredStep({ ...step, idx });
    setTooltipPosition({ 
      x: rect.left + rect.width / 2, 
      y: rect.top 
    });
  }, [showTooltip]);

  const handleMouseLeave = useCallback(() => {
    setHoveredStep(null);
  }, []);

  return (
    <div className="relative overflow-visible">
      <div className={`flex items-end ${height} w-full bg-gray-100 rounded-lg overflow-hidden`}>
        {stepsWithTime.map((step, idx) => {
          const power = getPower(step);
          const heightPercent = (power / maxPower) * 100;
          const duration = step.duration || 60;
          const widthPercent = (duration / totalDuration) * 100;
          const isRecovery = power < 60;
          const { bg, hex } = getZoneColorForPower(power, powerZones);
          const isRamp = step.power?.start !== undefined && step.power?.end !== undefined && step.power.start !== step.power.end;
          
          // For ramps, calculate start and end heights and colors
          if (isRamp) {
            const startPower = step.power.start;
            const endPower = step.power.end;
            const startHeight = (startPower / maxPower) * 100;
            const endHeight = (endPower / maxPower) * 100;
            const startColor = getZoneColorForPower(startPower, powerZones);
            const endColor = getZoneColorForPower(endPower, powerZones);
            
            // Calculate Y positions (0 = top, 100 = bottom in SVG)
            // Use maxPower for consistent scaling across all ramps
            const startY = 100 - startHeight;
            const endY = 100 - endHeight;
            
            return (
              <div
                key={idx}
                className="relative cursor-pointer transition-opacity hover:opacity-80"
                style={{ 
                  width: `${widthPercent}%`,
                  minWidth: '2px',
                  height: `${Math.max(startHeight, endHeight, 8)}%`
                }}
                onMouseEnter={(e) => handleMouseEnter(step, idx, e)}
                onMouseLeave={handleMouseLeave}
              >
                <svg 
                  width="100%" 
                  height="100%" 
                  preserveAspectRatio="none"
                  style={{ display: 'block' }}
                  viewBox="0 0 100 100"
                >
                  <defs>
                    <linearGradient id={`ramp-gradient-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={startColor.hex} />
                      <stop offset="100%" stopColor={endColor.hex} />
                    </linearGradient>
                  </defs>
                  <polygon
                    points={`0,${startY} 100,${endY} 100,100 0,100`}
                    fill={`url(#ramp-gradient-${idx})`}
                    opacity={isRecovery ? "0.5" : "1"}
                  />
                </svg>
              </div>
            );
          }
          
          // Regular steady state interval
          return (
            <div
              key={idx}
              className={`${bg} ${isRecovery ? 'opacity-50' : ''} cursor-pointer transition-opacity hover:opacity-80`}
              style={{ 
                height: `${Math.max(heightPercent, 8)}%`, 
                width: `${widthPercent}%`,
                minWidth: '2px'
              }}
              onMouseEnter={(e) => handleMouseEnter(step, idx, e)}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}
      </div>

      {/* Tooltip */}
      {showTooltip && hoveredStep && (
        <div 
          className="absolute z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '100%',
            marginBottom: '8px',
            whiteSpace: 'nowrap'
          }}
        >
          <div className="font-semibold text-yellow-400">
            {formatDurationWithSeconds(hoveredStep.duration)} @ {Math.round(getPower(hoveredStep))}% ({Math.round(getPower(hoveredStep) * ftp / 100)}W)
          </div>
          {hoveredStep.power?.start !== undefined && hoveredStep.power?.end !== undefined && hoveredStep.power.start !== hoveredStep.power.end && (
            <div className="text-gray-300">
              Ramp: {hoveredStep.power.start}% → {hoveredStep.power.end}%
            </div>
          )}
          <div className="text-gray-400">
            {formatDurationWithSeconds(hoveredStep.startTime)} - {formatDurationWithSeconds(hoveredStep.endTime)}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(WorkoutChart);
