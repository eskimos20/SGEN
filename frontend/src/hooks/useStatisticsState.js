import { useState, useRef } from 'react';
import { format, subDays } from 'date-fns';

// Custom hook for Statistics page state management
export const useStatisticsState = (user) => {
  // User and data state
  const [currentUser, setCurrentUser] = useState(user);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // AI Chat state
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasOpenAI, setHasOpenAI] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  
  // Chat window state
  const [isDragging, setIsDragging] = useState(false);
  const [chatPosition, setChatPosition] = useState({ x: 0, y: 0 });
  const [isFloating, setIsFloating] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const chatContainerRef = useRef(null);
  const lastUserMessageRef = useRef(null);
  
  // Activities and performance state
  const [expandedActivities, setExpandedActivities] = useState(new Set());
  const [activityDetails, setActivityDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(new Set());
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [top3Ftp, setTop3Ftp] = useState([]);
  const [top3Vo2Max, setTop3Vo2Max] = useState([]);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Athlete profile state
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Helper functions
  const resetChatPosition = () => {
    setChatPosition({ x: 0, y: 0 });
    setIsFloating(false);
    setIsMinimized(false);
  };

  const addChatMessage = (role, content, isError = false) => {
    setChatMessages(prev => [...prev, { role, content, isError }]);
  };

  const clearChatMessages = () => {
    setChatMessages([]);
  };

  const toggleActivityExpansion = (activityId) => {
    setExpandedActivities(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(activityId)) {
        newExpanded.delete(activityId);
      } else {
        newExpanded.add(activityId);
      }
      return newExpanded;
    });
  };

  const setActivityDetail = (activityId, details) => {
    setActivityDetails(prev => ({ ...prev, [activityId]: details }));
  };

  const setLoadingDetail = (activityId, isLoading) => {
    setLoadingDetails(prev => {
      const next = new Set(prev);
      if (isLoading) {
        next.add(activityId);
      } else {
        next.delete(activityId);
      }
      return next;
    });
  };

  const toggleEventExpansion = (eventId) => {
    setExpandedEvents(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(eventId)) {
        newExpanded.delete(eventId);
      } else {
        newExpanded.add(eventId);
      }
      return newExpanded;
    });
  };

  return {
    // User and data state
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
    
    // AI Chat state
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
    
    // Chat window state
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
    
    // Activities and performance state
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
    
    // Athlete profile state
    athleteProfile,
    setAthleteProfile,
    loadingProfile,
    setLoadingProfile,
    
    // Helper functions
    resetChatPosition,
    addChatMessage,
    clearChatMessages,
    toggleActivityExpansion,
    setActivityDetail,
    setLoadingDetail,
    toggleEventExpansion
  };
};
