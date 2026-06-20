import { useState, useEffect } from 'react';
import { Calendar, Clock, Zap, ArrowRight, ChevronDown, ChevronUp, Settings, X } from 'lucide-react';
import api from '../../api/axios';
import RangeSlider from '../ui/RangeSlider';
import SingleThumbSlider from '../ui/SingleThumbSlider';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const TrainingPlanConfig = ({ onComplete, onCancel, initialConfig, athleteProfile }) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(true);
  const [config, setConfig] = useState({
    activityType: 'Cycling', // Default to Cycling
    dailyMinutes: {
      Mon: '',
      Tue: '',
      Wed: '',
      Thu: '',
      Fri: '',
      Sat: '',
      Sun: ''
    },
    dailyMinutesMin: {
      Mon: '',
      Tue: '',
      Wed: '',
      Thu: '',
      Fri: '',
      Sat: '',
      Sun: ''
    },
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    workoutDays: [],
    hardDays: [],
    hardCategories: [],
    deloadWeek: {
      enabled: false,
      position: 'start',
      buildWeeks: 3,
      deloadPercent: 60
    },
    progressiveWeekLoad: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [hardCategoriesForDay, setHardCategoriesForDay] = useState({});
  const [sportSettings, setSportSettings] = useState(athleteProfile?.sportSettings || []);

  const normalizeDeloadWeek = (value, fallback) => {
    const base = value ?? fallback ?? { enabled: false, position: 'start', buildWeeks: 3, deloadPercent: 60 };
    const buildWeeksCandidate = Number(base.buildWeeks ?? base.cycle ?? 3);
    const deloadPercentCandidate = Number(base.deloadPercent ?? 60);
    return {
      enabled: !!base.enabled,
      position: base.position || 'start',
      buildWeeks: Number.isFinite(buildWeeksCandidate) && buildWeeksCandidate > 0 ? buildWeeksCandidate : 3,
      deloadPercent: Number.isFinite(deloadPercentCandidate) && deloadPercentCandidate >= 0 && deloadPercentCandidate <= 100 ? deloadPercentCandidate : 60
    };
  };

  // Load saved preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        // Use sportSettings from athleteProfile if available
        if (athleteProfile?.sportSettings) {
          setSportSettings(athleteProfile.sportSettings);
        }
        
        // If initialConfig is provided (user went back), use it
        if (initialConfig) {
          setConfig(prev => ({
            ...prev,
            ...initialConfig,
            deloadWeek: normalizeDeloadWeek(initialConfig.deloadWeek, prev.deloadWeek),
            progressiveWeekLoad: initialConfig.progressiveWeekLoad ?? prev.progressiveWeekLoad
          }));
          // Load day-specific hard categories if available
          if (initialConfig.daySpecificHardCategories) {
            setHardCategoriesForDay(initialConfig.daySpecificHardCategories);
          }
          setIsLoading(false);
          return;
        }
        
        // Otherwise load from saved preferences
        const response = await api.get('/statistics/training-preferences');
        if (response.data) {
          setConfig(prev => ({
            ...prev,
            activityType: response.data.activityType || prev.activityType,
            dailyMinutes: response.data.dailyMinutes || prev.dailyMinutes,
            dailyMinutesMin: response.data.dailyMinutesMin || prev.dailyMinutesMin,
            workoutDays: response.data.workoutDays || [],
            hardDays: response.data.hardDays || [],
            hardCategories: response.data.hardCategories || [],
            deloadWeek: normalizeDeloadWeek(response.data.deloadWeek, prev.deloadWeek),
            progressiveWeekLoad: response.data.progressiveWeekLoad ?? prev.progressiveWeekLoad
          }));
          
          // Load day-specific hard categories if available
          if (response.data.daySpecificHardCategories) {
            setHardCategoriesForDay(response.data.daySpecificHardCategories);
          }
        }
      } catch (err) {
        // No saved preferences or error loading
      } finally {
        setIsLoading(false);
      }
    };
    loadPreferences();
  }, [initialConfig, athleteProfile]);

  // Check FTP status for selected activity type
  const getFtpStatus = (activityType) => {
    if (!sportSettings || sportSettings.length === 0) {
      return { hasFtp: false, ftp: null, isDefault: true };
    }

    const sportTypeKey = activityType === 'Running' ? 'Run' : 'Ride';
    const settings = sportSettings.find(setting => 
      setting.types && setting.types.some(type => type === sportTypeKey)
    );

    const hasFtp = settings && settings.ftp;
    const ftp = hasFtp ? settings.ftp : (activityType === 'Running' ? 240 : 275);
    const isDefault = !hasFtp;

    return { hasFtp, ftp, isDefault };
  };

  const ftpStatus = getFtpStatus(config.activityType);
  const cyclingFtpStatus = getFtpStatus('Cycling');
  const runningFtpStatus = getFtpStatus('Running');

  // Week starts with Monday
  const weekDays = [
    { key: 'Mon', label: 'Mon' },
    { key: 'Tue', label: 'Tue' },
    { key: 'Wed', label: 'Wed' },
    { key: 'Thu', label: 'Thu' },
    { key: 'Fri', label: 'Fri' },
    { key: 'Sat', label: 'Sat' },
    { key: 'Sun', label: 'Sun' },
  ];

  const hardCategoryOptions = [
    { key: 'Anaerobic', label: 'Anaerobic' },
    { key: 'Sprint', label: 'Sprint' },
    { key: 'Sweetspot', label: 'Sweetspot' },
    { key: 'Tempo', label: 'Tempo' },
    { key: 'Threshold', label: 'Threshold' },
    { key: 'VO2Max', label: 'VO2Max' },
  ];

  const toggleDay = (dayKey, type) => {
    setConfig(prev => {
      const field = type === 'workout' ? 'workoutDays' : 'hardDays';
      const current = prev[field];
      
      if (current.includes(dayKey)) {
        return { ...prev, [field]: current.filter(d => d !== dayKey) };
      } else {
        return { ...prev, [field]: [...current, dayKey] };
      }
    });
  };

  const handleDeloadToggle = (enabled) => {
    setConfig(prev => ({
      ...prev,
      deloadWeek: {
        ...prev.deloadWeek,
        enabled: enabled
      }
    }));
  };

  const handleDeloadPositionChange = (position) => {
    setConfig(prev => ({
      ...prev,
      deloadWeek: {
        ...prev.deloadWeek,
        position: position
      }
    }));
  };

  const handleDeloadBuildWeeksChange = (buildWeeks) => {
    setConfig(prev => ({
      ...prev,
      deloadWeek: {
        ...prev.deloadWeek,
        buildWeeks: Number(buildWeeks)
      }
    }));
  };

  const handleDeloadPercentChange = (percent) => {
    setConfig(prev => ({
      ...prev,
      deloadWeek: {
        ...prev.deloadWeek,
        deloadPercent: Number(percent)
      }
    }));
  };

  const toggleDayExpanded = (dayKey) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dayKey)) {
        newSet.delete(dayKey);
      } else {
        newSet.add(dayKey);
      }
      return newSet;
    });
  };

  const handleMinutesRangeChange = (dayKey, range) => {
    setConfig(prev => ({
      ...prev,
      dailyMinutes: {
        ...prev.dailyMinutes,
        [dayKey]: range.max
      },
      dailyMinutesMin: {
        ...prev.dailyMinutesMin,
        [dayKey]: range.min
      }
    }));
  };

  const toggleHardEasy = (dayKey) => {
    const isWorkoutDay = config.workoutDays.includes(dayKey);
    if (!isWorkoutDay) return;
    
    const isHardDay = config.hardDays.includes(dayKey);
    
    if (isHardDay) {
      // Switch to Easy - remove from hard days and clear categories for this day
      setConfig(prev => ({
        ...prev,
        hardDays: prev.hardDays.filter(d => d !== dayKey)
      }));
      setHardCategoriesForDay(prev => {
        const newCategories = { ...prev };
        delete newCategories[dayKey];
        return newCategories;
      });
    } else {
      // Switch to Hard - add to hard days
      setConfig(prev => ({
        ...prev,
        hardDays: [...prev.hardDays, dayKey]
      }));
    }
  };

  const toggleDayCategory = (dayKey, categoryKey) => {
    setHardCategoriesForDay(prev => {
      const dayCategories = prev[dayKey] || [];
      if (dayCategories.includes(categoryKey)) {
        return {
          ...prev,
          [dayKey]: dayCategories.filter(c => c !== categoryKey)
        };
      } else {
        return {
          ...prev,
          [dayKey]: [...dayCategories, categoryKey]
        };
      }
    });
  };

  const getGlobalHardCategories = () => {
    const allCategories = new Set();
    Object.values(hardCategoriesForDay).forEach(dayCategories => {
      dayCategories.forEach(cat => allCategories.add(cat));
    });
    return Array.from(allCategories);
  };

  const toggleCategory = (categoryKey) => {
    setConfig(prev => {
      const current = prev.hardCategories;
      if (current.includes(categoryKey)) {
        return { ...prev, hardCategories: current.filter(c => c !== categoryKey) };
      } else {
        return { ...prev, hardCategories: [...current, categoryKey] };
      }
    });
  };

  const handleSubmit = async () => {
    // Update global hard categories from day-specific categories
    const globalCategories = getGlobalHardCategories();
    const finalConfig = {
      ...config,
      hardCategories: globalCategories,
      daySpecificHardCategories: hardCategoriesForDay
    };
    
    // Save preferences to database (excluding dates)
    try {
      await api.post('/statistics/training-preferences', {
        activityType: finalConfig.activityType,
        dailyMinutes: finalConfig.dailyMinutes,
        dailyMinutesMin: finalConfig.dailyMinutesMin,
        workoutDays: finalConfig.workoutDays,
        hardDays: finalConfig.hardDays,
        hardCategories: finalConfig.hardCategories,
        daySpecificHardCategories: finalConfig.daySpecificHardCategories,
        deloadWeek: finalConfig.deloadWeek,
        progressiveWeekLoad: finalConfig.progressiveWeekLoad,
        planStartDate: finalConfig.startDate,
        planEndDate: finalConfig.endDate
      });
    } catch (err) {
      // Failed to save preferences
    }
    onComplete(finalConfig);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-t-xl">
        {/* Header - Sticky */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-3 sm:p-6 sm:rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <div className="bg-gray-100 p-2 sm:p-3 rounded-xl">
              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-gray-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">Training Configuration</h2>
              <p className="text-gray-600 text-xs sm:text-sm truncate">Configure your training schedule</p>
            </div>
            <button
              onClick={onCancel}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0"
              title="Close"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-white pb-20 sm:pb-24">
          {/* Activity Type */}
          <div className="bg-blue-50 rounded-xl p-3 sm:p-4 border-0 sm:border sm:border-blue-200 -mx-4 sm:mx-0 px-4 sm:px-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-blue-600" />
                  Activity Type
                </h3>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="w-full sm:w-auto">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Activity Type
                    </label>
                    <select
                      value={config.activityType}
                      onChange={(e) => {
                        const selected = e.target.value;
                        const status = getFtpStatus(selected);
                        if (!status.hasFtp) return;
                        setConfig(prev => ({ ...prev, activityType: selected }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium text-sm"
                    >
                      <option value="Cycling" disabled={!cyclingFtpStatus.hasFtp}>
                        🚴‍♂️ Cycling{!cyclingFtpStatus.hasFtp ? ' (No FTP)' : ''}
                      </option>
                      <option value="Running" disabled={!runningFtpStatus.hasFtp}>
                        🏃‍♂️ Running{!runningFtpStatus.hasFtp ? ' (No FTP)' : ''}
                      </option>
                    </select>
                  </div>
                  
                  {/* FTP Status */}
                  <div className="flex-shrink-0 w-full sm:w-auto sm:self-end">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      {ftpStatus.hasFtp ? (
                        <div className="w-full px-3 py-1.5 rounded-lg text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                          <div className="flex items-center gap-2">
                            <span>⚡</span>
                            <span className="font-semibold">FTP: {ftpStatus.ftp}</span>
                            <span className="text-xs">From your settings</span>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-800 border border-red-200">
                          <div className="flex items-center gap-2">
                            <span>⚠️</span>
                            <span className="font-semibold">No FTP</span>
                            <span className="text-xs">Set FTP in your profile to generate workouts</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Date Range */}
          <div className="bg-gray-50 rounded-xl p-3 sm:p-5 border-0 sm:border sm:border-gray-200 -mx-4 sm:mx-0 px-4 sm:px-5">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Training Period
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={config.startDate}
                  onChange={(e) => setConfig(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-1 sm:px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-xs sm:text-base"
                  style={{ minHeight: '40px', colorScheme: 'light' }}
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={config.endDate}
                  onChange={(e) => setConfig(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-1 sm:px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-xs sm:text-base"
                  style={{ minHeight: '40px', colorScheme: 'light' }}
                />
              </div>
            </div>
          </div>

          {/* Deload Week */}
          <div className="bg-gray-50 rounded-xl p-3 sm:p-5 border-0 sm:border sm:border-gray-200 -mx-4 sm:mx-0 px-4 sm:px-5">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600" />
              Deload Week
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
              Plan recovery weeks with endurance-only workouts and reduced volume.
            </p>

            <div className="flex flex-col items-start gap-3">
              <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                <div
                  onClick={() => handleDeloadToggle(!(config.deloadWeek?.enabled || false))}
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                    config.deloadWeek?.enabled
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {config.deloadWeek?.enabled && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700">Enable Deload Week</span>
              </label>
              {config.deloadWeek?.enabled && (
                <div className="w-full max-w-xs flex flex-col gap-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-lg text-sm font-medium self-start">{config.deloadWeek?.deloadPercent ?? 60}%</span>
                  <SingleThumbSlider
                    min={0}
                    max={100}
                    step={5}
                    value={config.deloadWeek?.deloadPercent ?? 60}
                    onChange={(val) => handleDeloadPercentChange(val)}
                    unit="%"
                    hideBadge
                  />
                </div>
              )}
            </div>

            {config.deloadWeek?.enabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Position
                </label>
                <select
                  value={config.deloadWeek?.position || 'start'}
                  onChange={(e) => handleDeloadPositionChange(e.target.value)}
                  className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value="start">Beginning of Period</option>
                  <option value="end">End of Period</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  Choose where the deload week sits within each cycle.
                </p>
              </div>
            )}

            {config.deloadWeek?.enabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cycle
                </label>
                <select
                  value={config.deloadWeek?.buildWeeks || 3}
                  onChange={(e) => handleDeloadBuildWeeksChange(e.target.value)}
                  className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value={2}>2 build / 1 deload</option>
                  <option value={3}>3 build / 1 deload</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  Repeat this pattern for the entire period.
                </p>
              </div>
            )}

            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setConfig(prev => ({ ...prev, progressiveWeekLoad: !prev.progressiveWeekLoad }))}
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                    config.progressiveWeekLoad
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {config.progressiveWeekLoad && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700">Enable Progressive Week Load</span>
              </label>
              <p className="text-xs text-gray-500 mt-2">
                Gradually increase load across build weeks (low → higher → highest), then reset after each deload.
              </p>
            </div>
          </div>

          {/* Workout Days - Compact Design */}
          <div className="bg-gray-50 rounded-xl p-3 sm:p-5 border-0 sm:border sm:border-gray-200 -mx-4 sm:mx-0 px-4 sm:px-5">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" />
              Workout Schedule
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
              Select days and adjust minutes with the slider
            </p>
            
            <div className="space-y-3">
              {weekDays.map(day => {
                const isWorkoutDay = config.workoutDays.includes(day.key);
                const isHardDay = config.hardDays.includes(day.key);
                const isExpanded = expandedDays.has(day.key);
                const minutes = config.dailyMinutes[day.key] || 0;
                const minMinutes = config.dailyMinutesMin[day.key] || 0;
                const dayCategories = hardCategoriesForDay[day.key] || [];
                
                return (
                  <div key={day.key} className="border border-gray-200 rounded-lg overflow-hidden transition-all">
                    {/* Day Header */}
                    <div className="flex items-center gap-2 p-3 bg-gray-50">
                      <button
                        onClick={() => toggleDay(day.key, 'workout')}
                        className={`w-14 flex-shrink-0 px-2 py-2 rounded-lg border-2 transition-all font-medium text-sm ${
                          isWorkoutDay
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                            : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {day.label}
                      </button>
                      
                      {isWorkoutDay && (
                        <>
                          <button
                            onClick={() => toggleDayExpanded(day.key)}
                            className="flex items-center gap-1.5 bg-white px-2 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex-1 min-w-0"
                          >
                            <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />
                            <span className="font-medium text-gray-800 text-xs sm:text-sm flex-1 text-center whitespace-nowrap leading-tight">{minMinutes}–{minutes} min</span>
                            {isExpanded ? (
                              <ChevronUp className="hidden sm:block h-4 w-4 text-gray-600 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="hidden sm:block h-4 w-4 text-gray-600 flex-shrink-0" />
                            )}
                          </button>
                          
                          <button
                            onClick={() => toggleHardEasy(day.key)}
                            className={`w-14 flex-shrink-0 px-2 py-2 rounded-lg border transition-all text-sm font-medium text-center ${
                              isHardDay
                                ? 'bg-orange-500 border-orange-500 text-white'
                                : 'bg-green-500 border-green-500 text-white'
                            }`}
                          >
                            {isHardDay ? 'Hard' : 'Easy'}
                          </button>
                        </>
                      )}
                    </div>
                    
                    {/* Expanded Content with Slider */}
                    {isWorkoutDay && isExpanded && (
                      <div className="p-3 sm:p-4 bg-white border-t border-gray-200">
                        <div className="space-y-4">
                          {/* Duration Range Slider */}
                          <div>
                            <RangeSlider
                              min={0}
                              max={360}
                              valueMin={minMinutes}
                              valueMax={minutes}
                              onChange={(range) => handleMinutesRangeChange(day.key, range)}
                              step={5}
                            />
                          </div>
                          
                          {/* Quick Adjust Buttons */}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleMinutesRangeChange(day.key, { min: Math.max(0, minMinutes - 5), max: Math.max(0, minutes - 5) })}
                              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                            >
                              -5 min
                            </button>
                            <button
                              onClick={() => handleMinutesRangeChange(day.key, { min: Math.max(0, minMinutes - 15), max: Math.max(0, minutes - 15) })}
                              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                            >
                              -15 min
                            </button>
                            <button
                              onClick={() => handleMinutesRangeChange(day.key, { min: Math.min(360, minMinutes + 5), max: Math.min(360, minutes + 5) })}
                              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                            >
                              +5 min
                            </button>
                            <button
                              onClick={() => handleMinutesRangeChange(day.key, { min: Math.min(360, minMinutes + 15), max: Math.min(360, minutes + 15) })}
                              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                            >
                              +15 min
                            </button>
                          </div>
                          
                          {/* Hard Categories - Only show if Hard is selected */}
                          {isHardDay && (
                            <div className="pt-3 border-t border-gray-200">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Hard Categories for {day.label}
                              </label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {hardCategoryOptions.map(cat => (
                                  <button
                                    key={cat.key}
                                    onClick={() => toggleDayCategory(day.key, cat.key)}
                                    className={`px-2 sm:px-3 py-2 rounded-lg border transition-all text-sm font-medium ${
                                      dayCategories.includes(cat.key)
                                        ? 'bg-orange-500 border-orange-500 text-white'
                                        : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400'
                                    }`}
                                  >
                                    {cat.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-3 sm:p-4 sm:rounded-b-2xl">
          <div className="flex flex-row justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-100 transition-colors font-medium text-xs sm:text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !ftpStatus.hasFtp}
              title={!ftpStatus.hasFtp ? 'No FTP set for selected sport – set FTP in your profile first' : ''}
              className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center gap-1.5 disabled:opacity-50 text-xs sm:text-sm"
            >
              Next
              <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingPlanConfig;
