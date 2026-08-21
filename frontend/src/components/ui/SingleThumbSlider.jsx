import { useState, useRef, useEffect } from 'react';

const SingleThumbSlider = ({ min, max, value, onChange, step = 5, label, unit = '%', hideBadge = false }) => {
  const [isDragging, setIsDragging] = useState(false);
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

  const getPositionFromValue = (val) => {
    const percentage = (val - min) / (max - min);
    return percentage * sliderWidth;
  };

  const getValueFromPosition = (position) => {
    const percentage = Math.max(0, Math.min(1, position / sliderWidth));
    const rawValue = min + percentage * (max - min);
    return Math.round(Math.round(rawValue / step) * step);
  };

  const getPositionFromEvent = (e) => {
    if (!sliderRef.current) return 0;
    const rect = sliderRef.current.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX - rect.left;
    }
    return e.clientX - rect.left;
  };

  const handleStart = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMove = (e) => {
    if (!isDragging || !sliderRef.current) return;
    const position = getPositionFromEvent(e);
    const newValue = getValueFromPosition(position);
    onChange(newValue);
  };

  const handleEnd = () => setIsDragging(false);

  useEffect(() => {
    const handleMouseMove = (e) => handleMove(e);
    const handleTouchMove = (e) => handleMove(e);
    const handleMouseUp = () => handleEnd();
    const handleTouchEnd = () => handleEnd();

    if (isDragging) {
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
  }, [isDragging, value, min, max, step, onChange]);

  const thumbPosition = getPositionFromValue(value);
  const fillWidth = thumbPosition;

  return (
    <div className="space-y-3">
      {!hideBadge && (
        <div className="flex items-center justify-between text-sm font-medium text-gray-700">
          {label && <span>{label}</span>}
          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-lg ml-auto">{value}{unit}</span>
        </div>
      )}

      <div className="relative py-3">
        <div
          ref={sliderRef}
          className="relative h-3 bg-gray-200 rounded-full cursor-pointer"
          onClick={(e) => {
            const position = e.clientX - sliderRef.current.getBoundingClientRect().left;
            onChange(getValueFromPosition(position));
          }}
        >
          {/* Fill */}
          <div
            className="absolute h-3 bg-blue-500 rounded-full"
            style={{ left: 0, width: `${fillWidth}px` }}
          />

          {/* Thumb */}
          <div
            className="absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full shadow-lg cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 top-1/2 touch-none"
            style={{ left: `${thumbPosition}px` }}
            onMouseDown={handleStart}
            onTouchStart={handleStart}
          />
        </div>
      </div>

    </div>
  );
};

export default SingleThumbSlider;
