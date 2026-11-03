import { useCallback, useEffect, useRef } from 'react';
import { buildMinimalData, fetchPerformanceData as fetchPerformanceDataAPI } from '../utils/statisticsUtils';
import { analyzeData as analyzeDataAPI, fetchActivityDetails, fetchStatisticsData } from '../services/statisticsService';

export const useStatisticsEventHandlers = ({
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
  // External functions
  fetchCalendarData,
  getUpcomingWorkouts
}) => {
  const copyTimeoutRef = useRef(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Handle drag start for chat window
  const handleChatDragStart = useCallback((e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    setIsFloating(true);
    dragStartPos.current = {
      x: e.clientX - chatPosition.x,
      y: e.clientY - chatPosition.y
    };
  }, [setIsDragging, setIsFloating, dragStartPos, chatPosition]);

  // Handle drag move for chat window
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setChatPosition({
      x: e.clientX - dragStartPos.current.x,
      y: e.clientY - dragStartPos.current.y
    });
  }, [isDragging, setChatPosition, dragStartPos]);

  // Handle drag end for chat window
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, [setIsDragging]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setAnalysis('');
    try {
      const result = await fetchStatisticsData(startDate, endDate, fetchCalendarData);
      setData(result);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setAnalysis, fetchCalendarData, setData, startDate, endDate]);

  // Fetch performance data
  const fetchPerformanceData = useCallback(async () => {
    setLoadingPerformance(true);
    try {
      const performanceData = await fetchPerformanceDataAPI();
      setTop3Ftp(performanceData.top3Ftp);
      setTop3Vo2Max(performanceData.top3Vo2Max);
    } finally {
      setLoadingPerformance(false);
    }
  }, [setLoadingPerformance, setTop3Ftp, setTop3Vo2Max]);

  // Toggle activity details
  const toggleActivityDetails = useCallback(async (activityId) => {
    toggleActivityExpansion(activityId);

    // Fetch details if not already loaded
    if (!activityDetails[activityId]) {
      setLoadingDetail(activityId, true);
      try {
        const intervalsData = await fetchActivityDetails(activityId);
        setActivityDetail(activityId, intervalsData);
      } catch (err) {
        console.error('Failed to fetch activity details for', activityId, err);
      } finally {
        setLoadingDetail(activityId, false);
      }
    }
  }, [toggleActivityExpansion, setLoadingDetail, setActivityDetail, activityDetails, expandedActivities, data]);

  // Toggle event details
  const toggleEventDetails = useCallback((eventId) => {
    toggleEventExpansion(eventId);
    // Events don't need additional data fetching since they're already complete
  }, [toggleEventExpansion]);

  // Analyze data with AI
  const analyzeData = useCallback(async (prompt) => {
    if (!data || !prompt.trim()) return;
    
    addChatMessage('user', prompt);
    setCustomPrompt('');
    setAnalyzing(true);
    
    const payloadSourceData = wellnessData?.length > 0
      ? { ...data, wellness: wellnessData }
      : data;
    const cleanedData = buildMinimalData(payloadSourceData, weeklyData, getUpcomingWorkouts, true, activityStats);
    
    // Build conversation history from existing chat messages (excluding error messages)
    const conversationHistory = chatMessages
      .filter(msg => !msg.isError)
      .map(msg => ({ role: msg.role, content: msg.content }));
    
    try {
      const analysis = await analyzeDataAPI(prompt, cleanedData, conversationHistory.length > 0 ? conversationHistory : null);
      
      // Add AI response to chat
      addChatMessage('assistant', analysis);
    } catch (err) {
      const errorMessage = `Error: ${err.response?.data?.error || err.response?.data?.message || 'Failed to analyze data'}`;
      addChatMessage('assistant', errorMessage, true);
    } finally {
      setAnalyzing(false);
    }
  }, [data, weeklyData, activityStats, wellnessData, chatMessages, addChatMessage, setCustomPrompt, setAnalyzing, getUpcomingWorkouts]);

  // Handle AI analyze button click
  const handleAIAnalyze = useCallback(() => {
    if (!customPrompt.trim()) return;
    analyzeData(customPrompt);
  }, [customPrompt, analyzeData]);

  // Handle key press in chat input
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAIAnalyze();
    }
  }, [handleAIAnalyze]);

  // Copy analysis to clipboard
  const copyAnalysis = useCallback(() => {
    navigator.clipboard.writeText(analysis);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) setCopied(false);
    }, 2000);
  }, [analysis, setCopied]);

  // Copy data to clipboard
  const copyDataToClipboard = useCallback(() => {
    if (!data) return;

    const payloadSourceData = wellnessData?.length > 0
      ? { ...data, wellness: wellnessData }
      : data;
    const cleanedData = buildMinimalData(payloadSourceData, weeklyData, getUpcomingWorkouts, true, activityStats);
    const formattedData = JSON.stringify(cleanedData, null, 2);
    
    navigator.clipboard.writeText(formattedData);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) setCopied(false);
    }, 2000);
  }, [data, weeklyData, activityStats, wellnessData, getUpcomingWorkouts, setCopied]);

  return {
    // Chat handlers
    handleChatDragStart,
    handleMouseMove,
    handleMouseUp,
    
    // Data handlers
    fetchData,
    fetchPerformanceData,
    toggleActivityDetails,
    toggleEventDetails,
    
    // AI handlers
    analyzeData,
    handleAIAnalyze,
    handleKeyPress,
    
    // Utility handlers
    copyAnalysis,
    copyDataToClipboard
  };
};
