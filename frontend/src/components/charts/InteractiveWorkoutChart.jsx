import React, { useState, useCallback, useRef, useEffect } from 'react';
import { getZoneColorForPower, DEFAULT_POWER_ZONES } from '../../utils/zoneUtils';

const InteractiveWorkoutChart = ({ steps, onStepUpdate, ftp = 280, powerZones = DEFAULT_POWER_ZONES }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragType, setDragType] = useState(null); // 'duration', 'power-start', 'power-end'
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const chartRef = useRef(null);

  if (!steps || steps.length === 0) return null;

  // Calculate total duration and max power
  const totalDuration = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
  const maxPower = Math.max(...steps.map(s => {
    // Check for powerStart/powerEnd (ramps) or power (steady)
    if (s.powerStart !== undefined && s.powerEnd !== undefined) {
      return Math.max(s.powerStart, s.powerEnd);
    }
    return s.power || 50;
  }), 100);

  // Calculate cumulative positions
  let cumulativeTime = 0;
  const stepsWithPosition = steps.map((step, idx) => {
    const startTime = cumulativeTime;
    const duration = step.duration || 0;
    cumulativeTime += duration;
    const widthPercent = (duration / totalDuration) * 100;
    
    // Determine if this is a ramp (has powerStart and powerEnd)
    const isRamp = step.powerStart !== undefined && step.powerEnd !== undefined;
    let startPower, endPower;
    
    if (isRamp) {
      startPower = step.powerStart;
      endPower = step.powerEnd;
    } else {
      startPower = endPower = step.power || 50;
    }
    
    return {
      ...step,
      index: idx,
      startTime,
      endTime: cumulativeTime,
      widthPercent,
      startPower,
      endPower,
      isRamp
    };
  });

  const handleMouseDown = useCallback((e, index, type) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingIndex(index);
    setDragType(type);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (draggingIndex === null || !chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const step = stepsWithPosition[draggingIndex];
    
    if (dragType === 'duration') {
      // Calculate new duration based on horizontal drag
      const deltaX = e.clientX - dragStart.x;
      const deltaPercent = (deltaX / rect.width) * 100;
      const deltaDuration = (deltaPercent / 100) * totalDuration;
      const newDuration = Math.max(30, step.duration + deltaDuration); // Min 30 seconds
      
      onStepUpdate(step.index, 'duration', Math.round(newDuration));
      setDragStart({ x: e.clientX, y: dragStart.y });
    } else if (dragType === 'power-start' || dragType === 'power-end') {
      // Calculate new power based on vertical drag
      const deltaY = dragStart.y - e.clientY; // Inverted Y
      const deltaPercent = (deltaY / rect.height) * 100;
      const deltaPower = (deltaPercent / 100) * maxPower;
      
      if (dragType === 'power-start') {
        const newPower = Math.max(0, Math.min(200, step.startPower + deltaPower));
        if (step.isRamp) {
          onStepUpdate(step.index, 'powerStart', Math.round(newPower));
        } else {
          onStepUpdate(step.index, 'power', Math.round(newPower));
        }
      } else {
        const newPower = Math.max(0, Math.min(200, step.endPower + deltaPower));
        if (step.isRamp) {
          onStepUpdate(step.index, 'powerEnd', Math.round(newPower));
        } else {
          onStepUpdate(step.index, 'power', Math.round(newPower));
        }
      }
      
      setDragStart({ x: dragStart.x, y: e.clientY });
    }
  }, [draggingIndex, dragType, dragStart, stepsWithPosition, totalDuration, maxPower, onStepUpdate]);

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
    setDragType(null);
  }, []);

  useEffect(() => {
    if (draggingIndex !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingIndex, handleMouseMove, handleMouseUp]);

  return (
    <div 
      ref={chartRef}
      className="relative h-64 w-full bg-gray-100 rounded-lg overflow-hidden select-none"
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0">
        {stepsWithPosition.map((step, idx) => {
          const x = (step.startTime / totalDuration) * 100;
          const width = step.widthPercent;
          const startHeight = (step.startPower / maxPower) * 100;
          const endHeight = (step.endPower / maxPower) * 100;
          
          const { bg, hex } = getZoneColorForPower(
            step.isRamp ? (step.startPower + step.endPower) / 2 : step.startPower, 
            powerZones
          );
          
          const isHovered = hoveredIndex === idx;
          const isDragging = draggingIndex === idx;
          
          return (
            <g key={idx}>
              {/* Main bar/ramp */}
              {step.isRamp ? (
                <polygon
                  points={`
                    ${x},${100 - startHeight}
                    ${x + width},${100 - endHeight}
                    ${x + width},100
                    ${x},100
                  `}
                  fill={hex}
                  opacity={isDragging ? 0.7 : isHovered ? 0.9 : 0.8}
                  className="transition-opacity cursor-move"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              ) : (
                <rect
                  x={x}
                  y={100 - startHeight}
                  width={width}
                  height={startHeight}
                  fill={hex}
                  opacity={isDragging ? 0.7 : isHovered ? 0.9 : 0.8}
                  className="transition-opacity cursor-move"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              )}
              
              {/* Interactive handles when hovered */}
              {isHovered && (
                <>
                  {/* Duration handle (right edge) */}
                  <rect
                    x={x + width - 0.5}
                    y={0}
                    width={1}
                    height={100}
                    fill="blue"
                    opacity="0.5"
                    className="cursor-ew-resize"
                    onMouseDown={(e) => handleMouseDown(e, idx, 'duration')}
                  />
                  
                  {/* Power start handle (top-left) */}
                  <circle
                    cx={x + 1}
                    cy={100 - startHeight}
                    r="1.5"
                    fill="white"
                    stroke="blue"
                    strokeWidth="0.3"
                    className="cursor-ns-resize"
                    onMouseDown={(e) => handleMouseDown(e, idx, 'power-start')}
                  />
                  
                  {/* Power end handle (top-right) - only for ramps */}
                  {step.isRamp && (
                    <circle
                      cx={x + width - 1}
                      cy={100 - endHeight}
                      r="1.5"
                      fill="white"
                      stroke="blue"
                      strokeWidth="0.3"
                      className="cursor-ns-resize"
                      onMouseDown={(e) => handleMouseDown(e, idx, 'power-end')}
                    />
                  )}
                </>
              )}
              
              {/* Tooltip */}
              {isHovered && !isDragging && (
                <g>
                  <rect
                    x={x + width / 2 - 10}
                    y={Math.max(5, 100 - Math.max(startHeight, endHeight) - 15)}
                    width={20}
                    height={12}
                    fill="rgba(0,0,0,0.8)"
                    rx="1"
                  />
                  <text
                    x={x + width / 2}
                    y={Math.max(10, 100 - Math.max(startHeight, endHeight) - 8)}
                    fill="white"
                    fontSize="3"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {Math.floor(step.duration / 60)}:{String(step.duration % 60).padStart(2, '0')}
                    {step.isRamp 
                      ? ` ${Math.round(step.startPower)}→${Math.round(step.endPower)}%`
                      : ` @${Math.round(step.startPower)}%`
                    }
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      
      {/* Instructions overlay */}
      {steps.length > 0 && (
        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-3 py-1 rounded pointer-events-none">
          Hover over intervals to adjust • Drag edges to change duration • Drag circles to change power
        </div>
      )}
    </div>
  );
};

export default InteractiveWorkoutChart;
