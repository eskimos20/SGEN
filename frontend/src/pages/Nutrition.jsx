import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCalendar } from '../context/CalendarContext';
import api from '../api/axios';
import { Loader2, Utensils, Flame, Zap, Activity, Clock, TrendingUp, ChevronDown, ChevronUp, Info, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { calculateAge } from '../utils/athleteUtils';
import { formatDuration } from '../utils/dataUtils';
import {
  calculateBMR,
  calculateTDEE,
  estimateActivityLevel,
  calculateWorkoutMacros,
  estimateSubstrateOxidation,
  getWorkoutType,
  getActivityKcal,
  joulesToKcal,
  workKjToKcal,
  normalizeHeightToCm,
  ACTIVITY_LEVELS
} from '../utils/nutritionUtils';
import { calculateWorkoutMetrics, parseWorkoutName } from '../utils/workoutUtils';
import { getSportSettingsForType } from '../utils/zoneUtils';
import { getCalendarDisplayRange } from '../utils/calendarUtils';
import { getItemsForDate, buildDateStr } from '../utils/calendarDayItems';
import AdHocWorkoutPlanner from '../components/shared/AdHocWorkoutPlanner';

const Nutrition = () => {
  const { hasIntervalsConfig, loading: authLoading } = useAuth();
  const {
    calendarEvents,
    calendarActivities,
    fetchCalendarData,
    isDateRangeCovered
  } = useCalendar();

  const [athleteProfile, setAthleteProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activityLevelOverride, setActivityLevelOverride] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedWorkout, setExpandedWorkout] = useState(null);
  const [sexOverride, setSexOverride] = useState(null);
  const [adHocKcal, setAdHocKcal] = useState(0);

  // Fetch athlete profile
  useEffect(() => {
    if (authLoading || !hasIntervalsConfig) {
      setLoadingProfile(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const response = await api.get('/statistics/athlete-profile');
        setAthleteProfile(response.data);
      } catch (err) {
        // Silently fail
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchProfile();
  }, [hasIntervalsConfig, authLoading]);

  // Fetch calendar data for selected date's month
  useEffect(() => {
    if (!hasIntervalsConfig) return;
    const date = new Date(selectedDate);
    const { oldest, newest } = getCalendarDisplayRange(date);
    if (!isDateRangeCovered(oldest, newest)) {
      fetchCalendarData(oldest, newest);
    }
  }, [selectedDate, hasIntervalsConfig]);

  // Derived athlete data
  const athlete = athleteProfile?.athlete;
  const weight = athlete?.icu_weight || athlete?.weight || 0;
  const heightRaw = athlete?.height || 0;
  const heightCm = normalizeHeightToCm(heightRaw);
  const age = calculateAge(athlete?.icu_date_of_birth);
  // intervals.icu uses 'M'/'F', normalize to 'male'/'female' for BMR calculation
  const rawSex = sexOverride || (athlete?.sex === 'M' ? 'male' : athlete?.sex === 'F' ? 'female' : null);
  const sex = rawSex || 'male';

  const bmr = calculateBMR(weight, heightCm, age, sex);

  // Get items for selected date
  const dayItems = useMemo(() => {
    const activities = calendarActivities || [];
    const events = calendarEvents || [];
    return getItemsForDate(selectedDate, activities, events, []);
  }, [selectedDate, calendarActivities, calendarEvents]);

  const completedActivities = dayItems.filter(i => i.isCompleted);
  const plannedEvents = dayItems.filter(i => !i.isCompleted);

  // Calculate week range - memoized separately for better performance
  const weekRange = useMemo(() => {
    const d = new Date(selectedDate);
    const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - dayOfWeek + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    return {
      startStr: weekStart.toISOString().split('T')[0],
      endStr: weekEnd.toISOString().split('T')[0]
    };
  }, [selectedDate]);

  // Calculate weekly training hours for auto activity level
  // Uses completed activities + planned events (moving_time) for the selected week
  const weeklyHours = useMemo(() => {
    const { startStr, endStr } = weekRange;
    let totalSeconds = 0;

    // Completed activities
    const completedDates = new Set();
    (calendarActivities || []).forEach(a => {
      const aDate = a.start_date_local?.substring(0, 10);
      if (aDate >= startStr && aDate <= endStr && a.moving_time) {
        totalSeconds += a.moving_time;
        completedDates.add(aDate);
      }
    });

    // Planned WORKOUT events — only count for dates without a completed activity
    (calendarEvents || []).forEach(e => {
      if (e.category && e.category !== 'WORKOUT') return;
      const eDate = e.start_date_local?.substring(0, 10);
      if (eDate >= startStr && eDate <= endStr && e.moving_time && !completedDates.has(eDate)) {
        totalSeconds += e.moving_time;
      }
    });

    return totalSeconds / 3600;
  }, [weekRange, calendarActivities, calendarEvents]);

  const autoActivityLevel = estimateActivityLevel(weeklyHours);
  const activityLevel = activityLevelOverride || autoActivityLevel;
  const tdee = calculateTDEE(bmr, activityLevel);

  // Calculate daily exercise kcal
  const completedKcal = completedActivities.reduce((sum, a) => sum + getActivityKcal(a), 0);

  const plannedKcal = plannedEvents.reduce((sum, e) => {
    if (e.workout_doc?.steps) {
      const activityType = e.workout_doc?.sport_type || e.activityType || e.sport_type || e.type || 'Ride';
      const sportSettings = getSportSettingsForType(athleteProfile?.sportSettings, activityType);
      const metrics = calculateWorkoutMetrics(e.workout_doc, sportSettings.ftp);
      return sum + (metrics?.work ? workKjToKcal(metrics.work) : 0);
    }
    return sum;
  }, 0);

  const totalExerciseKcal = completedKcal + plannedKcal + adHocKcal;
  const totalDailyNeed = tdee + totalExerciseKcal;

  // Reset ad-hoc kcal when date changes
  useEffect(() => {
    setAdHocKcal(0);
  }, [selectedDate]);

  // Navigate date (use noon to avoid DST issues, format as local date)
  const navigateDate = (days) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  if (loadingProfile || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading nutrition data...</p>
        </div>
      </div>
    );
  }

  if (!hasIntervalsConfig) {
    return (
      <div className="text-center py-12">
        <Utensils className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">Nutrition Calculator</h2>
        <p className="text-gray-500 mt-2">Configure your Intervals.icu settings in Profile to use this feature.</p>
      </div>
    );
  }

  const missingData = !weight || !heightCm || !age;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Nutrition</h1>
          <p className="text-gray-600 mt-1">Energy balance and nutrition recommendations based on your training</p>
        </div>

      {/* Athlete info banner */}
      {missingData && (
        <div className="bg-amber-50 border border-amber-200 sm:rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Info className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Missing athlete data</p>
              <p className="text-sm">
                {!weight && 'Weight'}{!weight && (!heightCm || !age) && ', '}
                {!heightCm && 'Height'}{!heightCm && !age && ', '}
                {!age && 'Date of birth'}
                {' '}not found in your Intervals.icu profile. Update your profile for accurate calculations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sex selector (if not from API) */}
      {!athlete?.sex && !sexOverride && (
        <div className="bg-blue-50 border border-blue-200 sm:rounded-lg p-2 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 text-blue-800">
              <Info className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">Sex not found in profile. Select for accurate BMR:</span>
            </div>
            <div className="flex gap-2 ml-7 sm:ml-0">
              <button
                onClick={() => setSexOverride('male')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  sex === 'male' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-100'
                }`}
              >
                Male
              </button>
              <button
                onClick={() => setSexOverride('female')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  sex === 'female' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-100'
                }`}
              >
                Female
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BMR / TDEE Overview Card */}
      <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Daily Energy Balance
        </h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-orange-50 sm:rounded-lg p-2 sm:p-3 text-center">
            <div className="text-2xl font-bold text-orange-700">{bmr || '-'}</div>
            <div className="text-xs text-orange-600 font-medium">BMR (kcal)</div>
            <div className="text-[10px] text-gray-500 mt-1">Mifflin-St Jeor</div>
          </div>
          <div className="bg-amber-50 sm:rounded-lg p-2 sm:p-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{tdee || '-'}</div>
            <div className="text-xs text-amber-600 font-medium">TDEE (kcal)</div>
            <div className="text-[10px] text-gray-500 mt-1">Base daily need</div>
          </div>
          <div className="bg-rose-50 sm:rounded-lg p-2 sm:p-3 text-center">
            <div className="text-2xl font-bold text-rose-700">{totalExerciseKcal || '-'}</div>
            <div className="text-xs text-rose-600 font-medium">Exercise (kcal)</div>
            <div className="text-[10px] text-gray-500 mt-1">Today's training</div>
          </div>
          <div className="bg-green-50 sm:rounded-lg p-2 sm:p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{totalDailyNeed || '-'}</div>
            <div className="text-xs text-green-600 font-medium">Total Need (kcal)</div>
            <div className="text-[10px] text-gray-500 mt-1">TDEE + Exercise</div>
          </div>
        </div>

        {/* Athlete stats row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-600 border-t border-gray-100 pt-3 sm:pt-4">
          {weight > 0 && <span>Weight: <strong>{weight} kg</strong></span>}
          {heightCm > 0 && <span>Height: <strong>{heightCm} cm</strong></span>}
          {age && <span>Age: <strong>{age} yr</strong></span>}
          <span>Sex: <strong>{sex === 'female' ? 'Female' : 'Male'}</strong></span>
          <span>Weekly hours: <strong>{weeklyHours.toFixed(1)}h</strong></span>
        </div>

        {/* Activity level selector */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Activity Level (PAL)</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {ACTIVITY_LEVELS.map(level => (
              <button
                key={level.key}
                onClick={() => setActivityLevelOverride(level.key === autoActivityLevel ? null : level.key)}
                className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors border ${
                  activityLevel === level.key
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
                title={level.description}
              >
                <div>{level.label}</div>
                <div className="text-[10px] opacity-75">×{level.factor}</div>
                {level.key === autoActivityLevel && !activityLevelOverride && (
                  <div className="text-[10px] mt-0.5 opacity-75">Auto</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date Navigator */}
      <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigateDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-lg font-semibold text-gray-900 border-none bg-transparent text-center cursor-pointer focus:ring-0"
            />
          </div>
          <button onClick={() => navigateDate(1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Per-Workout Breakdown */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary-600" />
          Workouts on {selectedDate}
        </h2>

        {dayItems.length === 0 && (
          <AdHocWorkoutPlanner
            sportSettings={athleteProfile?.sportSettings}
            weightKg={weight}
            onKcalEstimated={setAdHocKcal}
          />
        )}

        {dayItems.map((item, idx) => {
          const isCompleted = item.isCompleted;
          const itemKcal = isCompleted
            ? getActivityKcal(item)
            : (() => {
                if (!item.workout_doc?.steps) return 0;
                const actType = item.workout_doc?.sport_type || item.activityType || item.sport_type || item.type || 'Ride';
                const sportSettings = getSportSettingsForType(athleteProfile?.sportSettings, actType);
                const metrics = calculateWorkoutMetrics(item.workout_doc, sportSettings.ftp);
                return metrics?.work ? workKjToKcal(metrics.work) : 0;
              })();

          const durationMin = item.moving_time ? Math.round(item.moving_time / 60) : 60;

          // Derive intensity info from icu_intensity when available
          const rawIF = item.icu_intensity || 0;
          const normalizedIF = rawIF > 2 ? rawIF : rawIF * 100; // normalize to percentage (e.g. 65)
          // Map %FTP to 0-1 intensityFactor: 40%→0, 80%→0.5, 120%→1.0
          const activityIF = normalizedIF > 0 ? Math.min(1, Math.max(0, (normalizedIF - 40) / 80)) : null;
          const wType = activityIF !== null
            ? (normalizedIF >= 88 ? 'interval' : 'endurance')
            : getWorkoutType(item);
          const macros = itemKcal > 0 && weight > 0 ? calculateWorkoutMacros(itemKcal, weight, durationMin, wType, activityIF) : null;
          const substrate = itemKcal > 0 && normalizedIF > 0
            ? estimateSubstrateOxidation(itemKcal, normalizedIF, null)
            : null;

          const isExpanded = expandedWorkout === idx;

          return (
            <div key={item.id || idx} className="bg-white rounded-xl sm:shadow-sm border border-gray-200 overflow-hidden">
              {/* Workout header */}
              <button
                onClick={() => setExpandedWorkout(isExpanded ? null : idx)}
                className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg ${isCompleted ? 'bg-green-100' : 'bg-blue-100'}`}>
                    <Activity className={`h-5 w-5 ${isCompleted ? 'text-green-600' : 'text-blue-600'}`} />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="font-medium text-gray-900 truncate">{parseWorkoutName(item.name).mainName}</div>
                    {parseWorkoutName(item.name).shortDescription && (
                      <div className="text-xs text-gray-500 truncate">{parseWorkoutName(item.name).shortDescription}</div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm text-gray-500">
                      {item.moving_time > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(item.moving_time)}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {isCompleted ? 'Completed' : 'Planned'}
                      </span>
                      <span className="text-xs capitalize text-gray-400 hidden sm:inline">{wType}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {itemKcal > 0 && (
                    <div className="text-right">
                      <div className="text-lg font-bold text-rose-600">{isCompleted ? '' : '~'}{itemKcal}</div>
                      <div className="text-xs text-gray-500">kcal</div>
                    </div>
                  )}
                  {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                </div>
              </button>

              {/* Expanded nutrition details */}
              {isExpanded && (macros || substrate) && (
                <div className="border-t border-gray-100 p-3 sm:p-4 bg-gray-50 space-y-3 sm:space-y-4">
                  {/* Substrate oxidation — estimated carb vs fat burn */}
                  {substrate && (
                    <div className="bg-purple-50 border border-purple-200 sm:rounded-lg p-2 sm:p-4">
                      <h4 className="font-medium text-purple-800 mb-2 flex items-center gap-2 text-sm">
                        <Flame className="h-4 w-4" />
                        Estimated Fuel Usage {normalizedIF > 0 && <span className="text-xs font-normal text-purple-600">(IF {normalizedIF}%)</span>}
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
                      <div className="mt-2 h-3 rounded-full overflow-hidden flex bg-gray-200">
                        <div className="bg-amber-400 transition-all" style={{ width: `${substrate.carbPercent}%` }} />
                        <div className="bg-emerald-400 transition-all" style={{ width: `${substrate.fatPercent}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>Carbs {substrate.carbPercent}%</span>
                        <span>Fat {substrate.fatPercent}%</span>
                      </div>
                    </div>
                  )}

                  {/* During Workout */}
                  {macros && macros.during.applicable && (
                    <div className="bg-yellow-50 border border-yellow-200 sm:rounded-lg p-2 sm:p-4">
                      <h4 className="font-medium text-yellow-800 mb-2 flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        During Workout
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Carbs:</span>
                          <span className="font-semibold text-gray-900 ml-1">{macros.during.carbsGrams}g</span>
                          <span className="text-gray-500 ml-1">({macros.during.carbsKcal} kcal)</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Rate:</span>
                          <span className="font-semibold text-gray-900 ml-1">{macros.during.carbsPerHour}g/h</span>
                        </div>
                      </div>
                      <p className="text-xs text-yellow-700 mt-2">
                        Start drinking/fueling after 15 min. Use gels, energy drinks, or bars.
                      </p>
                    </div>
                  )}

                  {/* Post-Workout (0-30 min) */}
                  {macros && (
                  <div className="bg-green-50 border border-green-200 sm:rounded-lg p-2 sm:p-4">
                    <h4 className="font-medium text-green-800 mb-2 flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4" />
                      Post-Workout (0-30 min)
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Carbs:</span>
                        <span className="font-semibold text-gray-900 ml-1">{macros.postWorkout.carbsGrams}g</span>
                        <span className="text-gray-500 ml-1">({macros.postWorkout.carbsKcal} kcal)</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Protein:</span>
                        <span className="font-semibold text-gray-900 ml-1">{macros.postWorkout.proteinGrams}g</span>
                        <span className="text-gray-500 ml-1">({macros.postWorkout.proteinKcal} kcal)</span>
                      </div>
                    </div>
                    <p className="text-xs text-green-700 mt-2">
                      Recovery shake or snack with ~{macros.postWorkout.totalKcal} kcal total.
                    </p>
                  </div>
                  )}

                  {/* Recovery Meal (1-2h) */}
                  {macros && (
                  <div className="bg-blue-50 border border-blue-200 sm:rounded-lg p-2 sm:p-4">
                    <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-2 text-sm">
                      <Utensils className="h-4 w-4" />
                      Recovery Meal (1-2h after)
                    </h4>
                    <div className="grid grid-cols-3 gap-3 text-sm">
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
                    <p className="text-xs text-blue-700 mt-2">
                      Full meal with ~{macros.recoveryMeal.totalKcal} kcal. E.g. rice/pasta + chicken/fish.
                    </p>
                  </div>
                  )}

                  {/* Summary bar */}
                  {macros && (
                  <div className="bg-white border border-gray-200 sm:rounded-lg p-2 sm:p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-600">Workout calorie burn:</span>
                      <span className="font-bold text-rose-600">{macros.workoutKcal} kcal</span>
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
                  )}
                </div>
              )}

              {/* Collapsed hint when no macros but has kcal */}
              {isExpanded && !macros && !substrate && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 text-center text-gray-500 text-sm">
                  No power/energy data available for this workout to calculate nutrition recommendations.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info section */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4 text-sm text-gray-600">
        <h3 className="font-semibold text-gray-700 mb-2">About the calculations</h3>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong>BMR</strong> — Mifflin-St Jeor equation using your weight, height, age, and sex</li>
          <li><strong>TDEE</strong> — BMR × Activity Level factor, auto-detected from weekly training hours</li>
          <li><strong>Completed kcal</strong> — Actual calories from Intervals.icu (<code>icu_joules</code>)</li>
          <li><strong>Planned kcal</strong> — Estimated from workout kJ with ~25% mechanical efficiency</li>
          <li><strong>Carb/Protein recommendations</strong> — Based on ACSM/ISSN sports nutrition guidelines</li>
          <li><strong>Fuel usage</strong> — Carb/fat split estimated from intensity (IF) using substrate oxidation curves (Romijn et al., Brooks & Mercier)</li>
          <li><strong>Workout nutrition target</strong> — Recovery meals are scaled to replace ~95% of workout calories; the remaining ~5% is expected to come from normal daily eating and fat oxidation</li>
        </ul>
      </div>
      </div>
    </div>
  );
};

export default Nutrition;
