import { useState, useRef, useEffect } from 'react';

const RangeSlider = ({ min, max, valueMin, valueMax, onChange, step = 5 }) => {
  const [isDraggingMin, setIsDraggingMin] = useState(false);
  const [isDraggingMax, setIsDraggingMax] = useState(false);
  const sliderRef = useRef(null);
  const [sliderWidth, setSliderWidth] = useState(0);

  useEffect(() => {
    const updateSliderWidth = () => {
      if (sliderRef.current) {
        setSliderWidth(sliderRef.current.offsetWidth);
      }
    };

    updateSliderWidth();
    window.addEventListener('resize', updateSliderWidth);
    return () => window.removeEventListener('resize', updateSliderWidth);
  }, []);

  const getPositionFromValue = (value) => {
    const percentage = (value - min) / (max - min);
    return percentage * sliderWidth;
  };

  const getValueFromPosition = (position) => {
    const percentage = Math.max(0, Math.min(1, position / sliderWidth));
    const rawValue = min + percentage * (max - min);
    return Math.round((Math.round(rawValue / step) * step));
  };

  const getPositionFromEvent = (e) => {
    if (!sliderRef.current) return 0;
    
    const rect = sliderRef.current.getBoundingClientRect();
    let position;
    
    if (e.touches && e.touches.length > 0) {
      // Touch event
      position = e.touches[0].clientX - rect.left;
    } else {
      // Mouse event
      position = e.clientX - rect.left;
    }
    
    return position;
  };

  const handleStart = (e, isMin) => {
    e.preventDefault();
    if (isMin) {
      setIsDraggingMin(true);
    } else {
      setIsDraggingMax(true);
    }
  };

  const handleMove = (e) => {
    if (!isDraggingMin && !isDraggingMax) return;
    
    if (!sliderRef.current) return;
    
    const position = getPositionFromEvent(e);
    const newValue = getValueFromPosition(position);

    if (isDraggingMin) {
      const clampedValue = Math.min(newValue, valueMax - step);
      onChange({ min: clampedValue, max: valueMax });
    } else if (isDraggingMax) {
      const clampedValue = Math.max(newValue, valueMin + step);
      onChange({ min: valueMin, max: clampedValue });
    }
  };

  const handleEnd = () => {
    setIsDraggingMin(false);
    setIsDraggingMax(false);
  };

  useEffect(() => {
    const handleMouseMove = (e) => handleMove(e);
    const handleTouchMove = (e) => handleMove(e);
    const handleMouseUp = () => handleEnd();
    const handleTouchEnd = () => handleEnd();

    if (isDraggingMin || isDraggingMax) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDraggingMin, isDraggingMax, valueMin, valueMax, min, max, step, onChange]);

  const minPosition = getPositionFromValue(valueMin);
  const maxPosition = getPositionFromValue(valueMax);
  const rangeWidth = maxPosition - minPosition;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm font-medium text-gray-700">
        <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-lg">Min: {valueMin} min</span>
        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-lg">Max: {valueMax} min</span>
      </div>
      
      <div className="relative py-3">
        {/* Track - taller hit area */}
        <div
          ref={sliderRef}
          className="relative h-3 bg-gray-200 rounded-full cursor-pointer"
        >
          {/* Range fill */}
          <div
            className="absolute h-3 bg-blue-500 rounded-full"
            style={{
              left: `${minPosition}px`,
              width: `${rangeWidth}px`
            }}
          />
          
          {/* Min handle - larger touch target */}
          <div
            className="absolute w-6 h-6 bg-green-500 border-2 border-white rounded-full shadow-lg cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 top-1/2 touch-none"
            style={{ left: `${minPosition}px` }}
            onMouseDown={(e) => handleStart(e, true)}
            onTouchStart={(e) => handleStart(e, true)}
          />
          
          {/* Max handle - larger touch target */}
          <div
            className="absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full shadow-lg cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 top-1/2 touch-none"
            style={{ left: `${maxPosition}px` }}
            onMouseDown={(e) => handleStart(e, false)}
            onTouchStart={(e) => handleStart(e, false)}
          />
        </div>
      </div>
      
      {/* Number inputs */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={(e) => {
            const newValue = parseInt(e.target.value) || min;
            const clampedValue = Math.min(newValue, valueMax - step);
            onChange({ min: clampedValue, max: valueMax });
          }}
          className="flex-1 px-2 py-2 border border-green-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
          style={{ fontSize: '16px' }}
        />
        <span className="text-gray-400 font-medium">–</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={(e) => {
            const newValue = parseInt(e.target.value) || max;
            const clampedValue = Math.max(newValue, valueMin + step);
            onChange({ min: valueMin, max: clampedValue });
          }}
          className="flex-1 px-2 py-2 border border-blue-300 rounded-lg text-center font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          style={{ fontSize: '16px' }}
        />
      </div>
    </div>
  );
};

export default RangeSlider;
