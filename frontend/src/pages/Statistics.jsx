import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCalendar } from '../context/CalendarContext';
import { Download, Bot, Copy, Loader2, CheckCircle, Activity, Zap, Clock, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import FitnessChart from '../components/charts/FitnessChart';
import PowerCurveHistoryChart from '../components/charts/PowerCurveHistoryChart';
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
  fetchPowerCurveHistory
} from '../services/statisticsService';
import { useStatisticsState } from '../hooks/useStatisticsState';
import { useStatisticsEventHandlers } from '../hooks/useStatisticsEventHandlers';

const Statistics = () => {
  const { hasIntervalsConfig, user } = useAuth();
  const { fetchCalendarData, getUpcomingWorkouts } = useCalendar();
  const hasStravaToken = user?.hasStravaToken || false;
  
  // State for wellness data (separate from statistics data)
  const [wellnessData, setWellnessData] = useState([]);
  const [loadingWellness, setLoadingWellness] = useState(false);
  
  // State for power curve history
  const [powerCurveHistory, setPowerCurveHistory] = useState(null);
  const [loadingPowerCurve, setLoadingPowerCurve] = useState(false);
  
  const [wellnessDays, setWellnessDays] = useState(() => {
    // Load saved preference from localStorage, default to 30 days
    const saved = localStorage.getItem('statistics-wellnessDays');
    return saved ? parseInt(saved, 10) : 30;
  });
  // Temporary slider value - updates while dragging, fetches only on release
  const [sliderValue, setSliderValue] = useState(wellnessDays);
  const [isFitnessExpanded, setIsFitnessExpanded] = useState(() => {
    // Load expanded state from localStorage, default to true
    const saved = localStorage.getItem('statistics-fitnessExpanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [isFtpExpanded, setIsFtpExpanded] = useState(() => {
    // Load expanded state from localStorage, default to true
    const saved = localStorage.getItem('statistics-ftpExpanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [isVo2MaxExpanded, setIsVo2MaxExpanded] = useState(() => {
    // Load expanded state from localStorage, default to true
    const saved = localStorage.getItem('statistics-vo2MaxExpanded');
    return saved !== null ? saved === 'true' : true;
  });
  
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

  // Sync slider value when wellnessDays changes (e.g., from localStorage load)
  useEffect(() => {
    setSliderValue(wellnessDays);
  }, []);

  // Save preferences to localStorage - consolidated for better performance
  useEffect(() => {
    localStorage.setItem('statistics-wellnessDays', wellnessDays.toString());
    localStorage.setItem('statistics-fitnessExpanded', isFitnessExpanded.toString());
    localStorage.setItem('statistics-ftpExpanded', isFtpExpanded.toString());
    localStorage.setItem('statistics-vo2MaxExpanded', isVo2MaxExpanded.toString());
  }, [wellnessDays, isFitnessExpanded, isFtpExpanded, isVo2MaxExpanded]);

  // Fetch wellness data on component mount and when wellnessDays changes
  useEffect(() => {
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
        
        // Fetch both wellness and power curve data in parallel
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
  }, [wellnessDays, hasIntervalsConfig]);

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
    // Strava
    hasStravaToken,
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

  // Fetch performance data when data is loaded and we're on overview tab
  useEffect(() => {
    if (activeTab === 'overview' && data && !hasFetchedPerformance.current) {
      if (top3Ftp.length === 0 && top3Vo2Max.length === 0) {
        hasFetchedPerformance.current = true;
        fetchPerformanceData();
      }
    }
    // Reset flag when switching away from overview tab
    if (activeTab !== 'overview') {
      hasFetchedPerformance.current = false;
    }
  }, [activeTab, data, top3Ftp.length, top3Vo2Max.length, fetchPerformanceData]);

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

      {/* Fitness Chart - Always show when wellness data is available */}
      {!loadingWellness && wellnessData.length > 0 && (
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
            <div className="flex items-center gap-3 mt-2" onClick={(e) => e.stopPropagation()}>
              <label className="text-sm font-medium text-gray-600 flex-shrink-0">
                Period: {Math.round(sliderValue / 30)} months
              </label>
              <input
                type="range"
                min="30"
                max="1095"
                step="30"
                value={sliderValue}
                onChange={(e) => setSliderValue(parseInt(e.target.value, 10))}
                onMouseUp={(e) => setWellnessDays(parseInt(e.target.value, 10))}
                onTouchEnd={(e) => {
                  const target = e.target;
                  setWellnessDays(parseInt(target.value, 10));
                }}
                className="flex-1 max-w-[300px]"
              />
            </div>
          </div>
          
          {isFitnessExpanded && (
            <div className="space-y-6">
              <FitnessChart wellness={wellnessData} athleteProfile={athleteProfile} />
              
              {/* Power Curve History */}
              {!loadingPowerCurve && powerCurveHistory && (
                <div className="pt-6 border-t border-gray-200">
                  <PowerCurveHistoryChart powerCurveHistory={powerCurveHistory} />
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
            </div>
          )}
        </div>
      )}
      
      {/* Show loading state for wellness data */}
      {loadingWellness && (
        <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Fitness & Form
          </h2>
          <div className="text-center py-8 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading fitness data...
          </div>
        </div>
      )}

      {/* Date Range Selector - Always show after profile is loaded */}
      {!loadingProfile && (
        <div ref={dateRangeRef} className="scroll-mt-20 bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4 mb-3 sm:mb-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-1 sm:px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-xs sm:text-base sm:input"
                style={{ minHeight: '40px', colorScheme: 'light' }}
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-1 sm:px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-xs sm:text-base sm:input"
                style={{ minHeight: '40px', colorScheme: 'light' }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-4">
            <button
              onClick={async () => { setIsFetching(true); shouldScrollRef.current = true; await fetchData(); setIsFetching(false); }}
              disabled={isFetching}
              className="btn btn-primary bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 flex items-center gap-2 disabled:opacity-100 disabled:cursor-not-allowed"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isFetching ? 'Fetching...' : 'Fetch Data'}
            </button>
            {data && currentUser?.hasOpenAIConfig && (
              <button
                onClick={() => setShowAIModal(true)}
                disabled={analyzing}
                className="btn btn-primary bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 flex items-center gap-2"
              >
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                AI Analyze
              </button>
            )}
            {data && !currentUser?.hasOpenAIConfig && (
              <button
                onClick={copyDataToClipboard}
                disabled={copied}
                className="btn btn-primary bg-green-600 hover:bg-green-700 flex items-center gap-2"
              >
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Data'}
              </button>
            )}
          </div>
        </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-4 text-center">
            <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-primary-600 mx-auto mb-2" />
            <div className="text-lg sm:text-2xl font-bold text-gray-900">{stats.totalActivities}</div>
            <div className="text-xs sm:text-sm text-gray-600">Activities</div>
          </div>
          <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-4 text-center">
            <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 mx-auto mb-2" />
            <div className="text-lg sm:text-2xl font-bold text-gray-900">{formatHoursMinutes(stats.totalTime)}</div>
            <div className="text-xs sm:text-sm text-gray-600">Total Time</div>
          </div>
          <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-4 text-center">
            <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 mx-auto mb-2" />
            <div className="text-lg sm:text-2xl font-bold text-gray-900">{Math.round(stats.totalDistance / 1000)}km</div>
            <div className="text-xs sm:text-sm text-gray-600">Distance</div>
          </div>
          <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-4 text-center">
            <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-amber-600 mx-auto mb-2" />
            <div className="text-lg sm:text-2xl font-bold text-gray-900">{Math.round(stats.totalLoad)}</div>
            <div className="text-xs sm:text-sm text-gray-600">Training Load</div>
          </div>
        </div>
      )}

      {/* Charts and Performance Data - Only show after date range search */}
      {data && (
        <StatisticsCharts
          weeklyData={weeklyData}
          top3Ftp={top3Ftp}
          top3Vo2Max={top3Vo2Max}
          COLORS={COLORS}
          isFtpExpanded={isFtpExpanded}
          setIsFtpExpanded={setIsFtpExpanded}
          isVo2MaxExpanded={isVo2MaxExpanded}
          setIsVo2MaxExpanded={setIsVo2MaxExpanded}
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
