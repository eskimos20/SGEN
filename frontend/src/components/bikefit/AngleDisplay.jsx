import { Activity, TrendingUp, TrendingDown } from 'lucide-react';

const AngleDisplay = ({ angles, ridingStyle = 'road', detectedSide = null }) => {
  const getAngleStatus = (angle, min, max) => {
    if (angle === null) return 'unknown';
    if (angle >= min && angle <= max) return 'good';
    return 'warning';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'good': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-orange-600 bg-orange-50 border-orange-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // Target ranges per riding style. Must stay in sync with the backend
  // BikeFitAnalysisService.getRange(). Conventions:
  //   kneeBDC = max knee extension (interior angle, 180 = straight leg)
  //   kneeTDC = max knee flexion (interior angle)
  //   hip     = closed hip angle at top of stroke (torso-to-thigh, smaller = more closed)
  //   back    = torso angle from the horizontal (0 = flat/aero, 90 = upright)
  //   elbow   = interior elbow angle (180 = straight arm)
  const angleRanges = {
    road: {
      kneeBDC: { min: 140, max: 150 },
      kneeTDC: { min: 65, max: 78 },
      hip: { min: 55, max: 75 },
      ankle: { min: 95, max: 115 },
      back: { min: 40, max: 55 },
      elbow: { min: 150, max: 168 }
    },
    aero: {
      kneeBDC: { min: 140, max: 150 },
      kneeTDC: { min: 65, max: 80 },
      hip: { min: 45, max: 62 },
      ankle: { min: 95, max: 115 },
      back: { min: 25, max: 40 },
      elbow: { min: 95, max: 115 }
    },
    mtb: {
      kneeBDC: { min: 138, max: 148 },
      kneeTDC: { min: 68, max: 82 },
      hip: { min: 62, max: 82 },
      ankle: { min: 95, max: 115 },
      back: { min: 45, max: 60 },
      elbow: { min: 150, max: 168 }
    }
  };

  const ranges = angleRanges[ridingStyle] || angleRanges.road;

  const angleData = [
    {
      label: 'Knee @ BDC (Bottom)',
      value: angles.kneeBDC,
      range: ranges.kneeBDC,
      icon: TrendingDown
    },
    {
      label: 'Knee @ TDC (Top)',
      value: angles.kneeTDC,
      range: ranges.kneeTDC,
      icon: TrendingUp
    },
    {
      label: 'Hip Angle (closed @ top)',
      value: angles.hip,
      range: ranges.hip,
      icon: Activity
    },
    {
      label: 'Ankle Angle',
      value: angles.ankle,
      range: ranges.ankle,
      icon: Activity
    },
    {
      label: 'Back Angle (from horizontal)',
      value: angles.back,
      range: ranges.back,
      icon: Activity
    },
    {
      label: 'Elbow Angle',
      value: angles.elbow,
      range: ranges.elbow,
      icon: Activity
    }
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Live Angle Analysis</h3>
        {detectedSide && (
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            {detectedSide === 'left' ? '← Left Side' : 'Right Side →'}
          </span>
        )}
      </div>
      
      {angleData.map(({ label, value, range, icon: Icon }) => {
        const status = getAngleStatus(value, range.min, range.max);
        const statusColor = getStatusColor(status);

        return (
          <div
            key={label}
            className={`p-2 sm:p-3 sm:rounded-lg border ${statusColor} transition-colors`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">
                  {value !== null ? `${value}°` : '--'}
                </div>
                <div className="text-xs opacity-75">
                  Good Range: {range.min}-{range.max}°
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="mt-4 p-2 sm:p-3 bg-gray-50 sm:rounded-lg border border-gray-200">
        <div className="text-xs text-gray-600">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Good Range</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span>Needs Adjustment</span>
          </div>
          <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-300">
            💡 <strong>Tip:</strong> Values are smoothed over multiple frames and only high-confidence data is used for accuracy.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AngleDisplay;
