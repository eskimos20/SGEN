import { useCallback } from 'react';
import api from '../api/axios';
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
  // Strava
  hasStravaToken,
  // External functions
  fetchCalendarData,
  getUpcomingWorkouts
}) => {
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
    // Find the activity from the data
    const activity = data?.activities?.find(a => a.id === activityId);
    
    toggleActivityExpansion(activityId);

    // Fetch details if not already loaded
    if (!activityDetails[activityId]) {
      setLoadingDetail(activityId, true);
      try {
        // Fetch Intervals data and Strava data (if available) in parallel
        const promises = [fetchActivityDetails(activityId)];
        
        // Check if we should fetch Strava data
        if (hasStravaToken && activity?.start_date) {
          const startDate = Math.floor(new Date(activity.start_date).getTime() / 1000);
          
          const stravaPhotosPromise = api.get('/strava/photos/by-date', {
            params: { startDate, toleranceSeconds: 300 }
          }).catch(err => ({ data: { found: false, photos: [], error: err?.response?.data } }));
          
          const stravaSegmentsPromise = api.get('/strava/segments/by-date', {
            params: { startDate, toleranceSeconds: 300 }
          }).catch(err => ({ data: { found: false, segments: [], error: err?.response?.data } }));
          
          promises.push(stravaPhotosPromise);
          promises.push(stravaSegmentsPromise);
        }
        
        // Wait for Intervals + photos + segments to complete in parallel
        const results = await Promise.allSettled(promises);
        
        // Extract Intervals data (always first)
        const intervalsData = results[0].status === 'fulfilled' ? results[0].value : null;
        
        // Extract Strava data (if fetched)
        let stravaData = null;
        if (hasStravaToken && results.length > 1) {
          const segmentsData = results[2]?.status === 'fulfilled' ? results[2].value?.data : null;
          
          // Batch-fetch PR data for ALL segments in parallel via single backend call
          let segmentPRs = {};
          if (segmentsData?.found && segmentsData?.segments?.length > 0) {
            const segmentIds = segmentsData.segments.map(e => e.segment?.id).filter(Boolean);
            if (segmentIds.length > 0) {
              try {
                const batchResponse = await api.post('/strava/segments/batch-pr', { segmentIds });
                const batchData = batchResponse.data || {};
                Object.entries(batchData).forEach(([id, pr]) => {
                  segmentPRs[Number(id)] = {
                    time: pr.prTime,
                    watts: pr.prWatts,
                    komTime: pr.komTime,
                    qomTime: pr.qomTime,
                    hasPR: pr.hasPR
                  };
                });
              } catch (err) {
                // Silent fail - PR data is optional
              }
            }
          }

          const photosData = results[1]?.status === 'fulfilled' ? results[1].value?.data : null;
          stravaData = {
            photos: photosData,
            segments: segmentsData,
            segmentPRs,
            hasStravaToken: true,
            rateLimit: photosData?.error?.error === 'rate_limit' || segmentsData?.error?.error === 'rate_limit',
            rateLimitSeconds: photosData?.error?.retryAfterSeconds || segmentsData?.error?.retryAfterSeconds || 0
          };
        }
        
        // Store combined data - only set after ALL data is ready
        setActivityDetail(activityId, {
          ...intervalsData,
          stravaData
        });
      } catch (err) {
        console.error('Failed to fetch activity details for', activityId, err);
      } finally {
        setLoadingDetail(activityId, false);
      }
    }
  }, [toggleActivityExpansion, setLoadingDetail, setActivityDetail, activityDetails, expandedActivities, data, hasStravaToken]);

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
    setTimeout(() => setCopied(false), 2000);
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
    setTimeout(() => setCopied(false), 2000);
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
