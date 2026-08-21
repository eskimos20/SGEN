import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, GripHorizontal, Minimize2, Maximize2, Calendar, CheckCircle } from 'lucide-react';
import api from '../../api/axios';
import TrainingPlanConfig from '../shared/TrainingPlanConfig';
import { calculateWorkoutMetrics } from '../../utils/workoutUtils';
import ConfirmDialog from './ConfirmDialog';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const SchedulerModal = ({ isOpen, onClose, fitnessData, onEventsCreated, athleteProfile }) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  const [showConfig, setShowConfig] = useState(true);
  const [trainingConfig, setTrainingConfig] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [error, setError] = useState(null);
  
  // Draggable window state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isFloating, setIsFloating] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragRef = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Handle drag start
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    setIsFloating(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  }, [position]);

  // Handle drag move
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Reset position when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPosition({ x: 0, y: 0 });
      setIsFloating(false);
      setIsMinimized(false);
      setShowConfig(true);
      setShowSummary(false);
      setTrainingConfig(null);
      setGeneratedSchedule(null);
    }
  }, [isOpen]);

  // Generate explicit date list with Hard/Easy type
  const toUtcMidnight = (dateValue) => {
    const d = typeof dateValue === 'string' ? new Date(`${dateValue}T00:00:00`) : new Date(dateValue);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const getDaysDiff = (dateValue, startValue) => {
    return Math.floor((toUtcMidnight(dateValue) - toUtcMidnight(startValue)) / 86400000);
  };

  const getCycleInfo = (date, deloadConfig, startDate) => {
    if (!startDate) {
      return { isDeload: false, buildIndex: null };
    }

    const planWeekStart = getWeekStart(startDate);
    const weekStart = getWeekStart(date);
    const weekIndex = Math.floor(getDaysDiff(weekStart, planWeekStart) / 7);

    const buildWeeks = Number(deloadConfig?.buildWeeks ?? 3);

    // If deload is disabled, cycle buildIndex based on buildWeeks (no deload week in cycle)
    if (!deloadConfig?.enabled) {
      const cycleIndex = ((weekIndex % buildWeeks) + buildWeeks) % buildWeeks;
      return { isDeload: false, buildIndex: cycleIndex };
    }

    const cycleLength = Math.max(buildWeeks, 1) + 1;
    const cycleIndex = ((weekIndex % cycleLength) + cycleLength) % cycleLength;

    const isDeload = deloadConfig.position === 'start'
      ? cycleIndex === 0
      : cycleIndex === Math.max(buildWeeks, 1);

    if (isDeload) {
      return { isDeload, buildIndex: null };
    }

    const buildIndex = deloadConfig.position === 'start'
      ? cycleIndex - 1
      : cycleIndex;

    return { isDeload, buildIndex };
  };

  const isDeloadWeek = (date, deloadConfig, startDate) => {
    return getCycleInfo(date, deloadConfig, startDate).isDeload;
  };

  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return new Date(utcMidnight - (day - 1) * 86400000);
  };

  // TSS progression scale: Deload 60%, Week 1 = 0%, Week 2 = 10%, Week 3 = 20%
  const getProgressionScale = (date, deloadConfig, isDeload, progressiveEnabled, startDate) => {
    if (!progressiveEnabled) return 1;
    if (isDeload) return (deloadConfig?.deloadPercent ?? 60) / 100; // Deload = configured % of base TSS

    const { buildIndex } = getCycleInfo(date, deloadConfig, startDate);
    if (buildIndex === null || buildIndex === undefined) return 1;

    const safeBuildIndex = Math.max(buildIndex, 0);
    // Progressive TSS increase: Week 1 = 0%, Week 2 = 10%, Week 3 = 20%
    const progressionValues = [0, 0.10, 0.20];
    const progressionIndex = Math.min(safeBuildIndex, progressionValues.length - 1);
    return 1 + progressionValues[progressionIndex];
  };

  const getProgressionLevel = (date, deloadConfig, isDeload, progressiveEnabled, startDate) => {
    if (!progressiveEnabled || isDeload) return null;

    const { buildIndex } = getCycleInfo(date, deloadConfig, startDate);
    if (buildIndex === null || buildIndex === undefined) return null;

    return Math.min(Math.max(buildIndex, 0), 2);
  };

  // No longer needed - using TSS-based progression instead of duration
  const getMinDurationForProgression = () => null;

  const generateScheduleDates = (config) => {
    if (!config?.startDate || !config?.endDate || !config?.workoutDays) return [];
    
    const dayNameToIndex = {
      'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4,
      'Fri': 5, 'Sat': 6, 'Sun': 7
    };
    
    const workoutDayIndices = config.workoutDays.map(d => dayNameToIndex[d]);
    const hardDayIndices = (config.hardDays || []).map(d => dayNameToIndex[d]);
    const daySpecificHardCategories = config.daySpecificHardCategories || {};
    const dailyMinutes = config.dailyMinutes || {};
    
    const dates = [];
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
      if (workoutDayIndices.includes(dayOfWeek)) {
        const isHard = hardDayIndices.includes(dayOfWeek);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        
        // Map day index back to day name
        const indexToDayName = {
          1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu',
          5: 'Fri', 6: 'Sat', 7: 'Sun'
        };
        const dayName = indexToDayName[dayOfWeek];
        
        const isDeload = isDeloadWeek(`${year}-${month}-${day}`, config.deloadWeek, config.startDate);
        const actualIsHard = isHard && !(isDeload && config.deloadWeek?.enabled);
        const baseMinutes = dailyMinutes[dayName] || 60;
        const baseMinutesMin = (config.dailyMinutesMin || {})[dayName] || 0;
        const progressionScale = getProgressionScale(d, config.deloadWeek, isDeload, config.progressiveWeekLoad, config.startDate);
        const progressionLevel = getProgressionLevel(d, config.deloadWeek, isDeload, config.progressiveWeekLoad, config.startDate);
        
        // During deload weeks, scale down duration by deload percentage
        const deloadFactor = (config.deloadWeek?.deloadPercent ?? 60) / 100;
        const targetMinutes = (isDeload && config.deloadWeek?.enabled) ? Math.round(baseMinutes * deloadFactor) : baseMinutes;
        const targetMinutesMin = (isDeload && config.deloadWeek?.enabled) ? Math.round(baseMinutesMin * deloadFactor) : baseMinutesMin;

        const dateEntry = {
          date: `${year}-${month}-${day}`,
          type: actualIsHard ? 'Hard' : 'Easy',
          dayOfWeek: dayOfWeek,
          isDeloadWeek: isDeload,
          targetMinutes,
          targetMinutesMin,
          progressionScale, // Send TSS progression scale to backend
          progressionLevel
        };
        
        // Add day-specific hard categories for Hard days
        if (actualIsHard && daySpecificHardCategories[dayName]) {
          dateEntry.hardCategories = daySpecificHardCategories[dayName];
        }
        
        dates.push(dateEntry);
      }
    }
    return dates;
  };

  // Calculate duration distribution for workouts based on daily minutes
  const calculateDurationDistribution = (config, scheduleDates) => {
    const durationsMap = {};
    
    scheduleDates.forEach(dateInfo => {
      durationsMap[dateInfo.date] = {
        max: dateInfo.targetMinutes || 60,
        min: dateInfo.targetMinutesMin || 0
      };
    });
    
    return durationsMap;
  };

  // Helper to get week key (year-week)
  const getWeekKey = (date) => {
    const d = new Date(date);
    const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay(); // Sunday = 7
    const thursday = new Date(d);
    thursday.setDate(d.getDate() - dayOfWeek + 4); // Thursday of this week
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const weekNumber = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
    return `${thursday.getFullYear()}-W${weekNumber}`;
  };

  const handleConfigComplete = (config) => {
    setTrainingConfig(config);
    setShowConfig(false);
    setShowSummary(true);
  };

  const handleGenerateSchedule = async () => {
    setIsGenerating(true);
    try {
      const scheduleDates = generateScheduleDates(trainingConfig);
      
      // Validate that there are workout days (not all rest days)
      if (scheduleDates.length === 0) {
        console.error('No workout days selected in the date range');
        setError('No workout days selected. The selected date range only contains rest days. Please select at least one workout day.');
        setIsGenerating(false);
        return;
      }
      
      const durationsMap = calculateDurationDistribution(trainingConfig, scheduleDates);
      
      // Build workout requests for backend
      const workoutRequests = scheduleDates.map(dateInfo => {
        let category;
        
        if (dateInfo.type === 'Easy') {
          category = 'Endurance';
        } else {
          // For hard days, use day-specific categories from dateInfo first
          const daySpecificCategories = dateInfo.hardCategories || [];
          
          if (daySpecificCategories.length > 0) {
            // Use day-specific categories
            category = daySpecificCategories[Math.floor(Math.random() * daySpecificCategories.length)];
          } else {
            // Fallback to global hard categories
            const categories = trainingConfig.hardCategories || [];
            if (categories.length === 0) {
              category = 'Endurance';
            } else {
              category = categories[Math.floor(Math.random() * categories.length)];
            }
          }
        }
        
        // Get target duration from our distribution map
        const durations = durationsMap[dateInfo.date] || { max: 60, min: 0 };
        
        // Send TSS progression scale and min/max duration to backend
        return {
          date: dateInfo.date,
          category: category,
          maxDuration: durations.max,
          minDuration: durations.min,
          progressionScale: dateInfo.progressionScale || 1.0,
          activityType: trainingConfig.activityType || 'Cycling'
        };
      });

      // Call backend to generate random workouts
      const response = await api.post('/statistics/generate-random-workouts', {
        workouts: workoutRequests
      });

      const events = response.data.events || [];
      
      if (events.length > 0) {
        // Process events with metrics
        const ftp = trainingConfig.activityType === 'Running' 
          ? (fitnessData?.runningFtp || fitnessData?.ftp || 250)
          : (fitnessData?.ftp || 250);
        
        const eventsWithMetrics = events.map((event, idx) => {
          const metrics = calculateWorkoutMetrics(event.workout_doc, ftp);
          // Get the original request to determine category
          const originalRequest = workoutRequests[idx];
          // Get the corresponding schedule date to find day-specific categories
          const scheduleDateInfo = scheduleDates.find(sd => sd.date === originalRequest.date);
          
          // Add metadata for regeneration
          const eventWithMetadata = { 
            ...event, 
            ...metrics,
            category: originalRequest.category,
            type: scheduleDateInfo?.type || 'Easy', // Add type field to distinguish hard/easy days
            activityType: trainingConfig.activityType, // Add activityType for FTP detection
            isDeloadWeek: scheduleDateInfo?.isDeloadWeek || false,
            hardCategories: scheduleDateInfo?.type === 'Hard' ? (scheduleDateInfo?.hardCategories || trainingConfig.hardCategories || []) : [],
            originalMaxDuration: originalRequest.maxDuration
          };
          
          return eventWithMetadata;
        });

        // Calculate actual total time per week
        const weeklyTotals = {};
        eventsWithMetrics.forEach(event => {
          const date = new Date(event.start_date_local);
          const weekKey = getWeekKey(date);
          if (!weeklyTotals[weekKey]) {
            weeklyTotals[weekKey] = 0;
          }
          weeklyTotals[weekKey] += (event.moving_time || 0) / 60; // Convert to minutes
        });

        setGeneratedSchedule({
          events: eventsWithMetrics,
          summary: {
            totalWorkouts: events.length,
            hardDays: scheduleDates.filter(d => d.type === 'Hard').length,
            easyDays: scheduleDates.filter(d => d.type === 'Easy').length,
            startDate: trainingConfig.startDate,
            endDate: trainingConfig.endDate,
            weeklyTotals: weeklyTotals
          }
        });

        // Send events to calendar for preview
        if (onEventsCreated) {
          onEventsCreated(eventsWithMetrics);
        }
      }
    } catch (err) {
      console.error('Failed to generate schedule:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  if (showConfig) {
    return (
      <TrainingPlanConfig
        isOpen={isOpen}
        onCancel={onClose}
        onComplete={handleConfigComplete}
        initialConfig={trainingConfig}
        athleteProfile={athleteProfile}
      />
    );
  }

  // Minimized view
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-2xl flex items-center gap-3 px-4 py-3 cursor-pointer hover:shadow-3xl transition-shadow border border-gray-200"
        onClick={() => setIsMinimized(false)}
      >
        <GripHorizontal className="h-5 w-5 text-gray-400" />
        <span className="text-gray-900 font-semibold">Scheduler</span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Maximize"
          >
            <Maximize2 className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Close"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 ${isFloating ? '' : 'bg-black/50'} flex items-center justify-center z-50 p-0 sm:p-4 ${isFloating ? 'pointer-events-none' : ''}`}>
      <div 
        ref={dragRef}
        className={`bg-white rounded-xl shadow-2xl w-full max-w-none sm:max-w-4xl h-[85vh] sm:h-[80vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-t-xl ${isFloating ? 'pointer-events-auto' : ''}`}
        style={isFloating ? {
          position: 'fixed',
          left: `calc(50% + ${position.x}px)`,
          top: `calc(50% + ${position.y}px)`,
          transform: 'translate(-50%, -50%)',
          maxWidth: '64rem',
          width: 'calc(100% - 2rem)'
        } : {}}
      >
        {/* Header - Draggable on desktop only */}
        <div 
          className={`px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 hidden sm:flex ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-5 w-5 text-gray-400" />
            <h2 className="text-xl font-bold text-gray-900">Training Scheduler</h2>
          </div>
          <div className="flex items-center gap-2">
            {isFloating && (
              <button
                onClick={() => { setPosition({ x: 0, y: 0 }); setIsFloating(false); }}
                className="px-2 py-1 text-xs bg-white hover:bg-gray-100 rounded text-gray-700 border border-gray-300 transition-colors"
                title="Center window"
              >
                Center
              </button>
            )}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Minimize"
            >
              <Minimize2 className="h-5 w-5 text-gray-600" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Mobile header (no drag) */}
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 sm:hidden">
          <h2 className="text-lg font-bold text-gray-900">Training Scheduler</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Summary Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!generatedSchedule ? (
            // Initial summary before generation
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="h-6 w-6 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Training Plan Summary</h3>
                </div>
                
                <div className="space-y-3 text-sm text-gray-700">
                  <div>
                    <span className="font-medium">Period:</span>
                    <p className="text-gray-600">{trainingConfig.startDate} to {trainingConfig.endDate}</p>
                  </div>
                  
                  <div>
                    <span className="font-medium">Training days:</span>
                    <p className="text-gray-600">
                      {(() => {
                        const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                        return [...trainingConfig.workoutDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)).join(', ');
                      })()}
                    </p>
                  </div>

                  <div>
                    <span className="font-medium">Deload Week:</span>
                    <p className="text-gray-600">
                      {trainingConfig.deloadWeek?.enabled
                        ? (() => {
                          const buildWeeks = trainingConfig.deloadWeek.buildWeeks || 3;
                          return trainingConfig.deloadWeek.position === 'end'
                            ? `End of period (${buildWeeks} build / 1 deload)`
                            : `Beginning of period (${buildWeeks} build / 1 deload)`;
                        })()
                        : 'Disabled'}
                    </p>
                  </div>
                  
                  <div>
                    <span className="font-medium">Hard categories per day:</span>
                    {trainingConfig.daySpecificHardCategories && Object.keys(trainingConfig.daySpecificHardCategories).length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {(() => {
                          // Sort days in chronological order
                          const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                          const sortedHardDays = [...trainingConfig.hardDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
                          
                          return sortedHardDays.map(day => {
                            const dayCategories = trainingConfig.daySpecificHardCategories[day] || [];
                            return (
                              <div key={day} className="flex items-center gap-2">
                                <span className="font-medium text-gray-700">{day}:</span>
                                <span className="text-gray-600">
                                  {dayCategories.length > 0 ? dayCategories.join(', ') : 'No categories selected'}
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <p className="text-gray-600">
                        {trainingConfig.hardCategories.length > 0 ? trainingConfig.hardCategories.join(', ') : 'None selected'}
                      </p>
                    )}
                  </div>
                  
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> Workouts will be generated automatically for all selected training days. 
                  Each workout will be within the min–max minutes you set for each day. 
                  Hard days get workouts from the categories selected for each specific day, while easy days get endurance workouts.
                </p>
              </div>

              <div className="flex justify-between items-center gap-2">
                <button
                  onClick={() => setShowConfig(true)}
                  className="px-3 sm:px-6 py-2 sm:py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors font-medium text-sm sm:text-base"
                >
                  ← Back
                </button>
                <button
                  onClick={handleGenerateSchedule}
                  disabled={isGenerating}
                  className="px-4 sm:px-8 py-2 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 transition-colors font-medium text-sm sm:text-lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      <span className="hidden sm:inline">Generating workouts...</span>
                      <span className="sm:hidden">Generating...</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span className="hidden sm:inline">Generate Workouts</span>
                      <span className="sm:hidden">Generate</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            // After generation - show summary with generated workouts
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Workouts Generated!</h3>
                </div>
                
                <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center mb-4">
                  <div className="bg-white rounded-lg p-4">
                    <div className="text-3xl font-bold text-gray-900">{generatedSchedule.summary.totalWorkouts}</div>
                    <div className="text-sm text-gray-600">Total workouts</div>
                  </div>
                  <div className="bg-white rounded-lg p-4">
                    <div className="text-3xl font-bold text-red-600">{generatedSchedule.summary.hardDays}</div>
                    <div className="text-sm text-gray-600">Hard days</div>
                  </div>
                  <div className="bg-white rounded-lg p-4">
                    <div className="text-3xl font-bold text-blue-600">{generatedSchedule.summary.easyDays}</div>
                    <div className="text-sm text-gray-600">Easy days</div>
                  </div>
                </div>

                {/* Weekly totals */}
                <div className="bg-white rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Minutes per week:</h4>
                  <div className="space-y-1 text-sm">
                    {Object.entries(generatedSchedule.summary.weeklyTotals).map(([week, minutes]) => {
                      const hours = (minutes / 60).toFixed(1);
                      return (
                        <div key={week} className="flex justify-between items-center">
                          <span className="text-gray-600">{week}:</span>
                          <span className="font-medium text-gray-900">
                            {Math.round(minutes)} min ({hours}h)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Generated Workouts:</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {generatedSchedule.events.map((event, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{event.name}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(event.start_date_local).toLocaleDateString('sv-SE', { 
                              weekday: 'short', 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-700">
                            {Math.round(event.moving_time / 60)} min
                          </div>
                          {event.icu_training_load && (
                            <div className="text-xs text-gray-500">
                              Load: {Math.round(event.icu_training_load)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  Workouts have been added as preview in the calendar. Go to the calendar to review the workouts and regenerate some if needed. 
                  When satisfied, use the <strong>"Commit Schedule"</strong> button in the calendar to upload the workouts to intervals.icu.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Only show when schedule is generated */}
        {generatedSchedule && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-center">
              <button
                onClick={onClose}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
              >
                <CheckCircle className="h-5 w-5" />
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Dialog */}
      <ConfirmDialog
        isOpen={!!error}
        title="Validation Error"
        message={error}
        confirmText="OK"
        onConfirm={() => setError(null)}
      />
    </div>
  );
};

export default SchedulerModal;
