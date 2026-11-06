import { useState, useEffect, useRef } from 'react';
import { differenceInCalendarDays, format, parseISO, subMonths } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { useCalendar } from '../context/CalendarContext';
import { Download, Bot, Copy, Loader2, CheckCircle, Activity, Zap, Clock, TrendingUp, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';
import FitnessChart from '../components/charts/FitnessChart';
import TrainingTotalsPanel from '../components/charts/TrainingTotalsPanel';
import PowerCurveHistoryChart from '../components/charts/PowerCurveHistoryChart';
import BestAllTimeCurveChart from '../components/charts/BestAllTimeCurveChart';
import DateRangeControls from '../components/statistics/DateRangeControls';
import StatsOverviewCard from '../components/statistics/StatsOverviewCard';
import ChatWindow from '../components/shared/ChatWindow';
import StatisticsCharts from '../components/charts/StatisticsCharts';
import AthleteProfile from '../components/athlete/AthleteProfile';
import ActivitiesList from '../components/activities/ActivitiesList';
import EventsList from '../components/calendar/EventsList';
import { fetchWellnessData } from '../utils/fitnessService';
import { formatDuration, formatHoursMinutes } from '../utils/dataUtils';
import { useStatisticsData } from '../utils/statisticsDataUtils';
import {
  fetchAthleteProfile,
  analyzeData as analyzeDataAPI,
  checkOpenAI,
  fetchCurrentUser as fetchCurrentUserAPI,
  fetchPowerCurveHistory,
  fetchTrainingTotalsActivities
} from '../services/statisticsService';
import { useStatisticsState } from '../hooks/useStatisticsState';
import { useStatisticsEventHandlers } from '../hooks/useStatisticsEventHandlers';
import { usePersistentPreference } from '../hooks/usePersistentPreference';

const Statistics = () => {
  const { hasIntervalsConfig, user } = useAuth();
  const { fetchCalendarData, getUpcomingWorkouts } = useCalendar();
  
  // State for wellness data (separate from statistics data)
  const [wellnessData, setWellnessData] = useState([]);
  const [loadingWellness, setLoadingWellness] = useState(false);
  const [trainingTotalsActivities, setTrainingTotalsActivities] = useState([]);
  const [loadingTrainingTotals, setLoadingTrainingTotals] = useState(false);
  const [trainingTotalsError, setTrainingTotalsError] = useState('');
  const [trainingTotalsOldest, setTrainingTotalsOldest] = useState(() => {
    const today = new Date();
    return format(subMonths(today, 1), 'yyyy-MM-dd');
  });
  const [trainingTotalsNewest, setTrainingTotalsNewest] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  
  // State for power curve history
  const [powerCurveHistory, setPowerCurveHistory] = useState(null);
  const [loadingPowerCurve, setLoadingPowerCurve] = useState(false);
  
  const [savedWellnessDays, setSavedWellnessDays, wellnessPreferenceReady] = usePersistentPreference('statistics-wellnessDays', '30');
  const wellnessDays = Number.parseInt(savedWellnessDays, 10) || 30;
  const setWellnessDays = (days) => setSavedWellnessDays(String(days));
  // Temporary slider value - updates while dragging, fetches only on release
  const [sliderValue, setSliderValue] = useState(wellnessDays);
  const [savedFitnessExpanded, setSavedFitnessExpanded] = usePersistentPreference('statistics-fitnessExpanded', 'true');
  const isFitnessExpanded = savedFitnessExpanded === 'true';
  const setIsFitnessExpanded = (expanded) => setSavedFitnessExpanded(String(expanded));
  const [statsExpandedPref, setStatsExpandedPref] = usePersistentPreference('statistics-statsExpanded', 'true');
  const isStatsExpanded = statsExpandedPref === 'true';
  
  // Separate fetching state for the button spinner - not affected by startTransition
  const [isFetching, setIsFetching] = useState(false);
  const dateRangeRef = useRef(null);
  const shouldScrollRef = useRef(false);

  // Use statistics state hook
  const {
    currentUser,
    setCurrentUser,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    data,
    setData,
    loading,
    setLoading,
    error,
    setError,
    analysis,
    setAnalysis,
    analyzing,
    setAnalyzing,
    copied,
    setCopied,
    hasOpenAI,
    setHasOpenAI,
    showAIModal,
    setShowAIModal,
    customPrompt,
    setCustomPrompt,
    chatMessages,
    setChatMessages,
    isDragging,
    setIsDragging,
    chatPosition,
    setChatPosition,
    isFloating,
    setIsFloating,
    isMinimized,
    setIsMinimized,
    dragStartPos,
    chatContainerRef,
    lastUserMessageRef,
    expandedActivities,
    setExpandedActivities,
    activityDetails,
    setActivityDetails,
    loadingDetails,
    setLoadingDetails,
    expandedEvents,
    setExpandedEvents,
    top3Ftp,
    setTop3Ftp,
    top3Vo2Max,
    setTop3Vo2Max,
    powerRecords,
    setPowerRecords,
    paceRecords,
    setPaceRecords,
    bestPowerCurve,
    setBestPowerCurve,
    loadingPerformance,
    setLoadingPerformance,
    activeTab,
    setActiveTab,
    athleteProfile,
    setAthleteProfile,
    loadingProfile,
    setLoadingProfile,
    resetChatPosition,
    addChatMessage,
    clearChatMessages,
    toggleActivityExpansion,
    setActivityDetail,
    setLoadingDetail,
    toggleEventExpansion
  } = useStatisticsState(user);

  // Sync the slider with the persisted period when it loads or changes.
  useEffect(() => {
    setSliderValue(wellnessDays);
  }, [wellnessDays]);

  // Fetch wellness and power curve data on component mount and when wellnessDays changes
  useEffect(() => {
    if (!wellnessPreferenceReady) return;
    const fetchWellnessAndPowerCurve = async () => {
      setLoadingWellness(true);
      setLoadingPowerCurve(true);
      try {
        // Get wellness data for selected number of days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - wellnessDays);
        
        // Use local date format to match intervals.icu behavior
        const formatLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const oldest = formatLocalDate(startDate);
        const newest = formatLocalDate(endDate);
        
        const [wellness, powerCurve] = await Promise.all([
          fetchWellnessData(oldest, newest),
          fetchPowerCurveHistory(oldest, newest).catch(err => {
            console.warn('Failed to fetch power curve history:', err);
            return null;
          })
        ]);
        
        setWellnessData(wellness);
        setPowerCurveHistory(powerCurve);
      } catch (err) {
        console.error('Failed to fetch wellness data:', err);
        setWellnessData([]);
        setPowerCurveHistory(null);
      } finally {
        setLoadingWellness(false);
        setLoadingPowerCurve(false);
      }
    };

    if (hasIntervalsConfig) {
      fetchWellnessAndPowerCurve();
    }
  }, [wellnessDays, hasIntervalsConfig, wellnessPreferenceReady]);

  // Training Totals uses its own date range, independent of the Fitness & Form slider.
  useEffect(() => {
    let cancelled = false;

    if (!hasIntervalsConfig) return () => { cancelled = true; };
    if (!trainingTotalsOldest || !trainingTotalsNewest || trainingTotalsOldest > trainingTotalsNewest) {
      setTrainingTotalsActivities([]);
      setTrainingTotalsError('Start date must be on or before end date.');
      setLoadingTrainingTotals(false);
      return () => { cancelled = true; };
    }

    setLoadingTrainingTotals(true);
    setTrainingTotalsError('');
    fetchTrainingTotalsActivities(trainingTotalsOldest, trainingTotalsNewest)
      .then((activities) => {
        if (!cancelled) setTrainingTotalsActivities(activities);
      })
      .catch((err) => {
        console.warn('Failed to fetch training totals:', err);
        if (!cancelled) {
          setTrainingTotalsActivities([]);
          setTrainingTotalsError('Could not load training totals for this period.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTrainingTotals(false);
      });

    return () => { cancelled = true; };
  }, [hasIntervalsConfig, trainingTotalsOldest, trainingTotalsNewest]);

  const trainingTotalsPeriodDays = trainingTotalsOldest && trainingTotalsNewest && trainingTotalsOldest <= trainingTotalsNewest
    ? differenceInCalendarDays(parseISO(trainingTotalsNewest), parseISO(trainingTotalsOldest)) + 1
    : 0;

  // Scroll to date range section when data arrives after a user-initiated fetch
  useEffect(() => {
    if (data && shouldScrollRef.current) {
      shouldScrollRef.current = false;
      dateRangeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [data]);

  // Use statistics data hook
  const { activityStats, weeklyData, COLORS } = useStatisticsData(data, athleteProfile);

  // Use statistics event handlers hook
  const {
    handleChatDragStart,
    handleMouseMove,
    handleMouseUp,
    fetchData,
    fetchPerformanceData,
    toggleActivityDetails,
    toggleEventDetails,
    analyzeData,
    handleAIAnalyze,
    handleKeyPress,
    copyAnalysis,
    copyDataToClipboard
  } = useStatisticsEventHandlers({
    // State setters
    setIsDragging,
    setIsFloating,
    setChatPosition,
    dragStartPos,
    setCurrentUser,
    setHasOpenAI,
    setAthleteProfile,
    setLoading,
    setError,
    setAnalysis,
    setLoadingPerformance,
    setTop3Ftp,
    setTop3Vo2Max,
    setPowerRecords,
    setPaceRecords,
    setBestPowerCurve,
    setCustomPrompt,
    setAnalyzing,
    setCopied,
    addChatMessage,
    setActivityDetail,
    setLoadingDetail,
    toggleActivityExpansion,
    toggleEventExpansion,
    setData,
    // State values
    isDragging,
    chatPosition,
    data,
    customPrompt,
    analysis,
    startDate,
    endDate,
    activityDetails,
    loadingDetails,
    expandedActivities,
    activityStats,
    weeklyData,
    wellnessData,
    chatMessages,
    // External functions
    fetchCalendarData,
    getUpcomingWorkouts
  });

  // Handle drag move for chat window
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await fetchCurrentUserAPI();
        setCurrentUser(user);
      } catch (err) {
        // Silently fail
      }
    };
    fetchCurrentUser();
  }, [setCurrentUser]);

  // Fetch athlete profile data
  const fetchAthleteProfileData = async () => {
    try {
      const profileData = await fetchAthleteProfile(hasIntervalsConfig);
      setAthleteProfile(profileData);
    } catch (err) {
      // Silently fail
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    const checkOpenAIStatus = async () => {
      try {
        const hasOpenAIStatus = await checkOpenAI();
        setHasOpenAI(hasOpenAIStatus);
      } catch (err) {
        setHasOpenAI(false);
      }
    };
    checkOpenAIStatus();

    fetchAthleteProfileData();
  }, [hasIntervalsConfig, setHasOpenAI]);

  // Track if performance data has been fetched to prevent race conditions
  const hasFetchedPerformance = useRef(false);

  // Fetch performance data once per overview visit — records/top-3 are
  // period-independent, so no date-range search is required.
  useEffect(() => {
    if (activeTab === 'overview' && !hasFetchedPerformance.current) {
      if (top3Ftp.length === 0 && top3Vo2Max.length === 0
          && powerRecords.length === 0 && paceRecords.length === 0) {
        hasFetchedPerformance.current = true;
        fetchPerformanceData();
      }
    }
    // Reset flag when switching away from overview tab
    if (activeTab !== 'overview') {
      hasFetchedPerformance.current = false;
    }
  }, [activeTab, data, top3Ftp.length, top3Vo2Max.length, powerRecords.length, paceRecords.length, fetchPerformanceData]);

  const stats = activityStats;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Statistics</h1>
          <p className="text-gray-600 mt-1">View and analyze your training data</p>
        </div>

        {/* Athlete Profile Card */}
        <AthleteProfile 
        athleteProfile={athleteProfile}
        loadingProfile={loadingProfile}
        onProfileUpdate={() => {
          // Refetch athlete profile when updated
          fetchAthleteProfileData();
        }}
      />

      {/* Fitness & Form period summary and charts */}
      {hasIntervalsConfig && (
        <TrainingTotalsPanel
          activities={trainingTotalsActivities}
          periodDays={trainingTotalsPeriodDays}
          loading={loadingTrainingTotals}
          error={trainingTotalsError}
          oldest={trainingTotalsOldest}
          newest={trainingTotalsNewest}
          onOldestChange={setTrainingTotalsOldest}
          onNewestChange={setTrainingTotalsNewest}
        />
      )}

      {hasIntervalsConfig && (
        <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
          <div className="mb-4">
            <div 
              className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setIsFitnessExpanded(!isFitnessExpanded)}
            >
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Fitness & Form
              </h2>
              {isFitnessExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-600" />
              )}
            </div>
          </div>
          
          {isFitnessExpanded && (
            <div className="space-y-6">
              <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <label htmlFor="fitness-period-slider" className="text-sm font-medium text-gray-600 flex-shrink-0">
                  Period: {Math.round(sliderValue / 30)} months
                </label>
                <input
                  id="fitness-period-slider"
                  type="range"
                  min="30"
                  max="1095"
                  step="30"
                  value={sliderValue}
                  onChange={(e) => setSliderValue(parseInt(e.target.value, 10))}
                  onMouseUp={(e) => setWellnessDays(parseInt(e.target.value, 10))}
                  onTouchEnd={(e) => setWellnessDays(parseInt(e.target.value, 10))}
                  onKeyUp={(e) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                      setWellnessDays(parseInt(e.currentTarget.value, 10));
                    }
                  }}
                  className="flex-1 max-w-[300px]"
                />
              </div>
              {loadingWellness ? (
                <div className="flex items-center justify-center py-6 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
                  Loading fitness data...
                </div>
              ) : wellnessData.length > 0 ? (
                <FitnessChart
                  wellness={wellnessData}
                  athleteProfile={athleteProfile}
                />
              ) : (
                <div className="py-5 text-center text-sm text-gray-500">No fitness or wellness data for this period.</div>
              )}
              
              {/* Power Curve for the searched period */}
              {!loadingPowerCurve && powerCurveHistory && (
                <div className="pt-6 border-t border-gray-200">
                  <PowerCurveHistoryChart powerCurveHistory={powerCurveHistory} title="Power Curve for Period" />
                </div>
              )}
              {loadingPowerCurve && (
                <div className="pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                    <span className="ml-2 text-sm text-gray-500">Loading power curve data...</span>
                  </div>
                </div>
              )}

              {/* Best All Time records curve — all-time, independent of search */}
              {((powerRecords || []).length > 0 || (paceRecords || []).length > 0) && (
                <div className="pt-6 border-t border-gray-200">
                  <BestAllTimeCurveChart powerRecords={powerRecords} paceRecords={paceRecords} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Date Range Selector - Always show after profile is loaded */}
      {!loadingProfile && (
        <DateRangeControls
          dateRangeRef={dateRangeRef}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          isFetching={isFetching}
          setIsFetching={setIsFetching}
          shouldScrollRef={shouldScrollRef}
          fetchData={fetchData}
          data={data}
          hasOpenAIConfig={currentUser?.hasOpenAIConfig}
          analyzing={analyzing}
          setShowAIModal={setShowAIModal}
          copyDataToClipboard={copyDataToClipboard}
          copied={copied}
        />
      )}

      {/* AI Chat Modal */}
      <ChatWindow
        showAIModal={showAIModal}
        isMinimized={isMinimized}
        isFloating={isFloating}
        isDragging={isDragging}
        chatPosition={chatPosition}
        chatMessages={chatMessages}
        analyzing={analyzing}
        customPrompt={customPrompt}
        startDate={startDate}
        endDate={endDate}
        chatContainerRef={chatContainerRef}
        lastUserMessageRef={lastUserMessageRef}
        handleChatDragStart={handleChatDragStart}
        setIsMinimized={setIsMinimized}
        setShowAIModal={setShowAIModal}
        setChatPosition={setChatPosition}
        setIsFloating={setIsFloating}
        setCustomPrompt={setCustomPrompt}
        handleKeyPress={handleKeyPress}
        handleAIAnalyze={handleAIAnalyze}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Overview Stats - Only show after date range search */}
      {data && stats && (
        <StatsOverviewCard
          stats={stats}
          expanded={isStatsExpanded}
          onToggle={() => setStatsExpandedPref(isStatsExpanded ? 'false' : 'true')}
        />
      )}

      {/* Charts and Performance Data - Only show after date range search */}
      {data && (
        <StatisticsCharts
          weeklyData={weeklyData}
          top3Ftp={top3Ftp}
          top3Vo2Max={top3Vo2Max}
          COLORS={COLORS}
          athleteProfile={athleteProfile}
        />
      )}

      {/* Activities List - Only show after date range search */}
      {data && (
        <ActivitiesList
          activeTab={activeTab}
          data={data}
          expandedActivities={expandedActivities}
          loadingDetails={loadingDetails}
          activityDetails={activityDetails}
          athleteProfile={athleteProfile}
          toggleActivityDetails={toggleActivityDetails}
          formatDuration={formatDuration}
        />
      )}

      {/* AI Analysis Result - Only show after date range search */}
      {data && analysis && (
        <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-600" />
              AI Analysis Result
            </h2>
          </div>
          
          <div className="relative">
            <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-sm">
              {analysis}
            </div>
            <button
              onClick={copyAnalysis}
              className="absolute top-2 right-2 p-2 hover:bg-gray-200 rounded"
              title="Copy to clipboard"
            >
              {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-600" />}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default Statistics;
