import { useState, useMemo, useEffect } from 'react';
import { Activity, Clock, Zap, TrendingUp, Utensils, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getAvailableSports,
  estimateKcalFromPower,
  estimateKcalFromMET,
  calculateWorkoutMacros,
  estimateSubstrateOxidation,
  getZoneMetrics,
  TRAINING_ZONES
} from '../../utils/nutritionUtils';

const AdHocWorkoutPlanner = ({ sportSettings, weightKg, onKcalEstimated }) => {
  const [selectedSport, setSelectedSport] = useState(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [intensityPercent, setIntensityPercent] = useState(75);
  const [zoneValue, setZoneValue] = useState(2);
  const [showResults, setShowResults] = useState(false);

  const availableSports = useMemo(() => getAvailableSports(sportSettings), [sportSettings]);

  // Auto-select first sport if none selected
  const currentSport = selectedSport || (availableSports.length > 0 ? availableSports[0] : null);
  const hasPower = currentSport?.hasPower || false;

  // Zone metrics for non-FTP sports
  const zoneMetrics = useMemo(() => getZoneMetrics(zoneValue), [zoneValue]);

  // Calculate estimated kcal
  const estimatedKcal = useMemo(() => {
    if (!currentSport || !durationMinutes) return 0;
    if (hasPower) {
      return estimateKcalFromPower(currentSport.ftp, intensityPercent, durationMinutes);
    }
    return estimateKcalFromMET(weightKg, null, durationMinutes, zoneMetrics.met);
  }, [currentSport, durationMinutes, intensityPercent, hasPower, weightKg, zoneMetrics]);

  // Map intensity to a 0-1 factor for continuous carb scaling
  // FTP-based: 40% → 0.0, 80% → 0.5, 120% → 1.0
  // Zone-based: Z1 → 0.0, Z4 → 0.5, Z7 → 1.0
  const intensityFactor = hasPower
    ? Math.min(1, Math.max(0, (intensityPercent - 40) / 80))
    : zoneMetrics.intensityFactor;

  // Calculate macros — pass intensityFactor so carb rates scale with effort
  const macros = useMemo(() => {
    if (!estimatedKcal || !weightKg) return null;
    const isHighIntensity = hasPower ? intensityPercent >= 88 : zoneValue >= 5;
    const wType = isHighIntensity ? 'interval' : 'endurance';
    return calculateWorkoutMacros(estimatedKcal, weightKg, durationMinutes, wType, intensityFactor);
  }, [estimatedKcal, weightKg, durationMinutes, zoneValue, hasPower, intensityFactor, intensityPercent]);

  // Estimate substrate oxidation (carb vs fat burn)
  const substrate = useMemo(() => {
    if (!estimatedKcal) return null;
    return hasPower
      ? estimateSubstrateOxidation(estimatedKcal, intensityPercent, null)
      : estimateSubstrateOxidation(estimatedKcal, null, zoneMetrics.effortLevel);
  }, [estimatedKcal, intensityPercent, zoneMetrics, hasPower]);

  const handleSportSelect = (sport) => {
    setSelectedSport(sport);
    setShowResults(false);
  };

  // Push kcal updates live when results are visible
  useEffect(() => {
    if (showResults) onKcalEstimated?.(estimatedKcal);
  }, [showResults, estimatedKcal]);

  const handleCalculate = () => {
    setShowResults(true);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="h-5 w-5 text-indigo-600" />
          Plan a Workout
        </h3>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">No workouts scheduled — estimate nutrition for an ad-hoc session</p>
      </div>

      <div className="p-3 sm:p-4 space-y-4">
        {/* Sport Selection */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Sport</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {availableSports.map(sport => (
              <button
                key={sport.key}
                onClick={() => handleSportSelect(sport)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border min-h-[3rem] flex flex-col items-center justify-center ${
                  currentSport?.key === sport.key
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div>{sport.label}</div>
                {sport.hasPower && (
                  <div className="text-[10px] opacity-75">FTP: {sport.ftp}W</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Duration: {durationMinutes} min ({Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m)
          </label>
          <input
            type="range"
            min="15"
            max="480"
            step="5"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="relative h-4 text-[10px] sm:text-xs text-gray-400 mt-1">
            {[
              { min: 15, label: '15m' },
              { min: 60, label: '1h' },
              { min: 120, label: '2h' },
              { min: 240, label: '4h' },
              { min: 360, label: '6h' },
              { min: 480, label: '8h' },
            ].map(t => (
              <span
                key={t.min}
                className="absolute -translate-x-1/2"
                style={{ left: `${((t.min - 15) / (480 - 15)) * 100}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* Intensity (FTP-based) or Effort (MET-based) */}
        {hasPower ? (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Intensity: {intensityPercent}% of FTP ({Math.round(currentSport.ftp * intensityPercent / 100)}W)
            </label>
            <input
              type="range"
              min="40"
              max="120"
              step="1"
              value={intensityPercent}
              onChange={(e) => setIntensityPercent(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="relative h-4 text-[10px] sm:text-xs text-gray-400 mt-1">
              {[
                { pct: 40, label: '40% Recovery' },
                { pct: 75, label: '75% Endurance' },
                { pct: 100, label: '100% FTP' },
                { pct: 120, label: '120%' },
              ].map(t => (
                <span
                  key={t.pct}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${((t.pct - 40) / (120 - 40)) * 100}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Intensity: Z{zoneValue.toFixed(1)} — {zoneMetrics.zoneName} (MET {zoneMetrics.met})
            </label>
            <input
              type="range"
              min="1"
              max="7"
              step="0.1"
              value={zoneValue}
              onChange={(e) => setZoneValue(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] sm:text-xs text-gray-400 mt-1">
              {TRAINING_ZONES.map(z => (
                <span key={z.zone} className={Math.round(zoneValue) === z.zone ? 'text-indigo-600 font-semibold' : ''}>
                  {z.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Calculate Button */}
        {!showResults && (
          <button
            onClick={handleCalculate}
            disabled={!estimatedKcal}
            className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Flame className="h-4 w-4" />
            Calculate Nutrition
          </button>
        )}

        {/* Results */}
        {showResults && estimatedKcal > 0 && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            {/* Estimated kcal summary */}
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-rose-700">~{estimatedKcal}</div>
              <div className="text-sm text-rose-600 font-medium">Estimated kcal</div>
              <div className="text-xs text-gray-500 mt-1">
                {currentSport?.label} · {durationMinutes} min ·{' '}
                {hasPower ? `${intensityPercent}% FTP (${Math.round(currentSport.ftp * intensityPercent / 100)}W)` : `Z${zoneValue.toFixed(1)} ${zoneMetrics.zoneName}`}
              </div>
            </div>

            {/* Substrate oxidation — estimated carb vs fat burn */}
            {substrate && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <h4 className="font-medium text-purple-800 mb-2 flex items-center gap-2 text-sm">
                  <Flame className="h-4 w-4" />
                  Estimated Fuel Usage
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold text-amber-700">{substrate.carbGrams}g</div>
                    <div className="text-xs text-gray-600">Carbohydrates ({substrate.carbPercent}%)</div>
                    <div className="text-[10px] text-gray-400">{substrate.carbKcal} kcal</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-emerald-700">{substrate.fatGrams}g</div>
                    <div className="text-xs text-gray-600">Fat ({substrate.fatPercent}%)</div>
                    <div className="text-[10px] text-gray-400">{substrate.fatKcal} kcal</div>
                  </div>
                </div>
                {/* Visual bar */}
                <div className="mt-2 h-3 rounded-full overflow-hidden flex bg-gray-200">
                  <div
                    className="bg-amber-400 transition-all"
                    style={{ width: `${substrate.carbPercent}%` }}
                  />
                  <div
                    className="bg-emerald-400 transition-all"
                    style={{ width: `${substrate.fatPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>Carbs {substrate.carbPercent}%</span>
                  <span>Fat {substrate.fatPercent}%</span>
                </div>
              </div>
            )}

            {/* Macro recommendations */}
            {macros && (
              <>
                {macros.during.applicable && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <h4 className="font-medium text-yellow-800 mb-1 flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4" />
                      During Workout
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Carbs:</span>
                        <span className="font-semibold text-gray-900 ml-1">{macros.during.carbsGrams}g</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Rate:</span>
                        <span className="font-semibold text-gray-900 ml-1">{macros.during.carbsPerHour}g/h</span>
                      </div>
                    </div>
                    <p className="text-xs text-yellow-700 mt-1">Start drinking/fueling after 15 min</p>
                  </div>
                )}

                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <h4 className="font-medium text-green-800 mb-1 flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4" />
                    Post-Workout (0-30 min)
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Carbs:</span>
                      <span className="font-semibold text-gray-900 ml-1">{macros.postWorkout.carbsGrams}g</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Protein:</span>
                      <span className="font-semibold text-gray-900 ml-1">{macros.postWorkout.proteinGrams}g</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h4 className="font-medium text-blue-800 mb-1 flex items-center gap-2 text-sm">
                    <Utensils className="h-4 w-4" />
                    Recovery Meal (1-2h after)
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Carbs:</span>
                      <span className="font-semibold text-gray-900 ml-1">{macros.recoveryMeal.carbsGrams}g</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Protein:</span>
                      <span className="font-semibold text-gray-900 ml-1">{macros.recoveryMeal.proteinGrams}g</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Fat:</span>
                      <span className="font-semibold text-gray-900 ml-1">{macros.recoveryMeal.fatGrams}g</span>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-600">Workout calorie burn:</span>
                    <span className="font-bold text-rose-600">{estimatedKcal} kcal</span>
                  </div>
                  {macros.during.applicable && (
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-600">Intake during workout:</span>
                      <span className="font-semibold text-yellow-600">{macros.during.carbsKcal} kcal</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-gray-600">Post + Recovery meal:</span>
                    <span className="font-semibold text-green-600">{macros.postWorkout.totalKcal + macros.recoveryMeal.totalKcal} kcal</span>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm pt-1.5 border-t border-gray-100">
                    <span className="text-gray-700 font-medium">Total nutrition intake:</span>
                    <span className="font-bold text-green-700">{macros.totalRecoveryKcal} kcal</span>
                  </div>
                </div>
              </>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

export default AdHocWorkoutPlanner;
