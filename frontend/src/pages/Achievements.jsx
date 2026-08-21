import { useState } from 'react';
import { Trophy, TrendingUp, Heart, Zap, Award, Check, X } from 'lucide-react';
import api from '../api/axios';
import { getSportEmoji } from '../utils/sportTypeUtils';

const Achievements = () => {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // 'date' or 'type'
  const [processingIds, setProcessingIds] = useState(new Set());
  const [respondedMap, setRespondedMap] = useState({});

  const fetchAchievements = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const response = await api.get('/statistics/achievements', {
        params: {
          startDate,
          endDate
        }
      });
      setAchievements(response.data.achievements || []);
    } catch (err) {
      console.error('Failed to fetch achievements:', err);
      setError('Failed to load achievements. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchAchievements();
  };

  const makeKey = (a) => `${a.activityId}__${a.achievementType}`;

  const handleAccept = async (achievement) => {
    const key = makeKey(achievement);
    setProcessingIds(prev => new Set(prev).add(key));
    try {
      await api.post('/statistics/achievement/by-activity/accept', {
        activityId: achievement.activityId,
        achievementType: achievement.achievementType,
        newFtpValue: achievement.newFtpValue ?? null,
        oldFtpValue: achievement.oldFtpValue ?? null,
        effortWatts: achievement.effortWatts ?? null,
        effortSeconds: achievement.effortSeconds ?? null,
        newLthrValue: achievement.newLthrValue ?? null,
        oldLthrValue: achievement.oldLthrValue ?? null,
        activityName: achievement.activityName,
        sportType: achievement.sportType,
        achievementDate: achievement.achievementDate,
      });
      setRespondedMap(prev => ({ ...prev, [key]: 'accepted' }));
    } catch (err) {
      console.error('Failed to accept achievement:', err);
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDismiss = async (achievement) => {
    const key = makeKey(achievement);
    setProcessingIds(prev => new Set(prev).add(key));
    try {
      await api.post('/statistics/achievement/by-activity/dismiss', {
        activityId: achievement.activityId,
        achievementType: achievement.achievementType,
        newFtpValue: achievement.newFtpValue ?? null,
        oldFtpValue: achievement.oldFtpValue ?? null,
        effortWatts: achievement.effortWatts ?? null,
        effortSeconds: achievement.effortSeconds ?? null,
        newLthrValue: achievement.newLthrValue ?? null,
        oldLthrValue: achievement.oldLthrValue ?? null,
        activityName: achievement.activityName,
        sportType: achievement.sportType,
        achievementDate: achievement.achievementDate,
      });
      setRespondedMap(prev => ({ ...prev, [key]: 'dismissed' }));
    } catch (err) {
      console.error('Failed to dismiss achievement:', err);
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const getAchievementIcon = (type) => {
    switch (type) {
      case 'FTP_UP':
        return <TrendingUp className="h-5 w-5 text-blue-600" />;
      case 'LTHR_UP':
        return <Heart className="h-5 w-5 text-red-600" />;
      case 'BEST_POWER':
        return <Zap className="h-5 w-5 text-yellow-600" />;
      case 'BEST_PACE':
        return <Award className="h-5 w-5 text-green-600" />;
      default:
        return <Trophy className="h-5 w-5 text-purple-600" />;
    }
  };

  const getAchievementColor = (type) => {
    switch (type) {
      case 'FTP_UP':
        return 'bg-blue-50 border-blue-200';
      case 'LTHR_UP':
        return 'bg-red-50 border-red-200';
      case 'BEST_POWER':
        return 'bg-yellow-50 border-yellow-200';
      case 'BEST_PACE':
        return 'bg-green-50 border-green-200';
      default:
        return 'bg-purple-50 border-purple-200';
    }
  };

  const formatAchievementMessage = (achievement) => {
    // Use the message from Intervals.icu if available, not null, and not just the type name
    if (achievement.message && 
        achievement.message !== 'null' && 
        achievement.message !== null &&
        achievement.message !== achievement.achievementType) {
      return achievement.message;
    }
    
    // Fallback formatting for specific types
    const { achievementType, effortSeconds, effortWatts, newFtpValue, newLthrValue, watts, secs, distance } = achievement;
    
    if (achievementType === 'FTP_UP' && newFtpValue && effortWatts && effortSeconds) {
      const minutes = Math.floor(effortSeconds / 60);
      const seconds = effortSeconds % 60;
      const timeStr = seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
      return `FTP ${newFtpValue}w from ${timeStr} at ${effortWatts}w`;
    }
    
    if (achievementType === 'LTHR_UP' && newLthrValue) {
      return `LTHR ${newLthrValue} bpm`;
    }
    
    if (achievementType === 'BEST_POWER' && watts && secs) {
      const minutes = Math.floor(secs / 60);
      const seconds = secs % 60;
      const timeStr = seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
      return `Best Power: ${watts}w for ${timeStr}`;
    }
    
    if (achievementType === 'BEST_PACE' && distance && secs) {
      const minutes = Math.floor(secs / 60);
      const seconds = secs % 60;
      const timeStr = seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
      const distanceKm = (distance / 1000).toFixed(2);
      return `Best Pace: ${distanceKm}km in ${timeStr}`;
    }
    
    // Generic fallback - show the type in a readable format
    return achievementType ? achievementType.replace(/_/g, ' ') : 'Achievement';
  };

  // Get the primary value for sorting by value
  const getAchievementValue = (achievement) => {
    switch (achievement.achievementType) {
      case 'FTP_UP':
        return achievement.newFtpValue || 0;
      case 'LTHR_UP':
        // Try to get from newLthrValue first
        if (achievement.newLthrValue) {
          return achievement.newLthrValue;
        }
        // Otherwise extract BPM from message (e.g., "1h at 182 bpm" or "98% of 20m at 188 bpm")
        if (achievement.message) {
          const bpmMatch = achievement.message.match(/(\d+)\s*bpm/i);
          if (bpmMatch) {
            return parseInt(bpmMatch[1], 10);
          }
        }
        return 0;
      case 'BEST_POWER':
        return achievement.watts || 0;
      case 'BEST_PACE':
        return achievement.distance || 0;
      default:
        return 0;
    }
  };

  // Get duration in minutes for LTHR achievements (for secondary sorting)
  const getLthrDuration = (achievement) => {
    if (achievement.achievementType !== 'LTHR_UP' || !achievement.message) {
      return 0;
    }
    // Extract duration from message (e.g., "1h at 182 bpm" or "98% of 20m at 188 bpm")
    const hourMatch = achievement.message.match(/(\d+)h/i);
    if (hourMatch) {
      return parseInt(hourMatch[1], 10) * 60; // Convert hours to minutes
    }
    const minMatch = achievement.message.match(/(\d+)m/i);
    if (minMatch) {
      return parseInt(minMatch[1], 10);
    }
    return 0;
  };

  // Sort achievements based on selected sort option
  const getSortedAchievements = () => {
    if (sortBy === 'date') {
      // Sort by date descending (newest first)
      return [...achievements].sort((a, b) => 
        new Date(b.achievementDate) - new Date(a.achievementDate)
      );
    } else {
      // Sort by type, then by value (highest first) within each type
      return [...achievements].sort((a, b) => {
        if (a.achievementType !== b.achievementType) {
          return a.achievementType.localeCompare(b.achievementType);
        }
        
        // Special handling for LTHR: sort by duration first, then by BPM
        if (a.achievementType === 'LTHR_UP') {
          const durationA = getLthrDuration(a);
          const durationB = getLthrDuration(b);
          if (durationA !== durationB) {
            return durationB - durationA; // Longest duration first
          }
          // Within same duration, sort by BPM (highest first)
          return getAchievementValue(b) - getAchievementValue(a);
        }
        
        // For other types, sort by value descending (highest first)
        return getAchievementValue(b) - getAchievementValue(a);
      });
    }
  };

  const sortedAchievements = getSortedAchievements();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-600" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Achievements</h1>
              <p className="text-gray-600 mt-1">View your training achievements over time</p>
            </div>
          </div>
        </div>

        {/* Date Filter */}
        <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
          <form onSubmit={handleSearch} className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
              {/* Start Date */}
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

              {/* End Date */}
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
                type="submit"
                disabled={loading}
                className="btn btn-primary bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 flex items-center justify-center gap-2 min-w-[120px]"
              >
                {loading ? 'Loading...' : 'Search'}
              </button>
            </div>
          </form>
        </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Achievements List */}
      {!loading && !error && (
        <div className="space-y-4">
          {!hasSearched ? (
            <div className="bg-white rounded-lg sm:shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
              <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Search for Achievements</h3>
              <p className="text-gray-600">Select a date range and click "Search Achievements" to view all your achievements (FTP, LTHR, Best Power, Best Pace, etc.)</p>
            </div>
          ) : achievements.length === 0 ? (
            <div className="bg-white rounded-lg sm:shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
              <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No achievements found</h3>
              <p className="text-gray-600">Try selecting a different date range</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <p className="text-sm text-gray-600">
                  Found {achievements.length} achievement{achievements.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="date">Date (Newest First)</option>
                    <option value="type">Type & Value (Highest First)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {sortedAchievements.map((achievement) => {
                  const key = makeKey(achievement);
                  const isProcessing = processingIds.has(key);
                  const responded = respondedMap[key];
                  const isFtp = achievement.achievementType === 'FTP_UP';
                  const isLthr = achievement.achievementType === 'LTHR_UP';
                  const canUpdate = isFtp || isLthr;
                  const oldValue = isFtp ? achievement.oldFtpValue : achievement.oldLthrValue;
                  const newValue = isFtp ? achievement.newFtpValue : achievement.newLthrValue;
                  const delta = newValue && oldValue ? newValue - oldValue : null;
                  const unit = isFtp ? 'w' : ' bpm';
                  const isAtCurrent = oldValue && newValue && newValue === oldValue;

                  return (
                    <div
                      key={achievement.id}
                      className={`bg-white rounded-lg sm:shadow-sm border-2 p-3 sm:p-4 hover:shadow-md transition-shadow ${getAchievementColor(achievement.achievementType)}`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="flex-shrink-0 mt-1">
                          {getAchievementIcon(achievement.achievementType)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Header */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">{getSportEmoji(achievement.sportType)}</span>
                            <div>
                              <h3 className="font-semibold text-gray-900">{achievement.activityName}</h3>
                              <p className="text-sm text-gray-600">{achievement.achievementDate}</p>
                            </div>
                          </div>

                          {/* Achievement Message */}
                          <div className="bg-white/50 rounded-lg p-2 sm:p-3 mb-2">
                            <p className="text-sm font-medium text-gray-900">
                              {formatAchievementMessage(achievement)}
                            </p>
                          </div>

                          {/* Value comparison for FTP/LTHR */}
                          {canUpdate && oldValue && newValue && (
                            <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                              <span className="font-medium">Update {isFtp ? 'FTP' : 'LTHR'}:</span>
                              <span className="font-mono">{oldValue}{unit}</span>
                              <span>→</span>
                              <span className="font-mono font-bold text-gray-900">{newValue}{unit}</span>
                              {delta !== null && (
                                <span className={delta > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                  ({delta > 0 ? '+' : ''}{delta}{unit})
                                </span>
                              )}
                            </div>
                          )}

                          {/* Action buttons for FTP/LTHR achievements */}
                          {canUpdate && (
                            <div className="flex gap-2 items-center">
                              {responded === 'accepted' ? (
                                <p className="text-sm font-medium text-green-700">
                                  ✓ Your {isFtp ? 'FTP' : 'LTHR'} is now updated to {newValue}{unit}
                                </p>
                              ) : responded === 'dismissed' ? (
                                <p className="text-sm text-gray-500">
                                  Skipped – no changes made
                                </p>
                              ) : isAtCurrent ? (
                                <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
                                  <Check className="h-3 w-3 text-green-600" />
                                  Your {isFtp ? 'FTP' : 'LTHR'} is already your current
                                </p>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleAccept(achievement)}
                                    disabled={isProcessing}
                                    className="flex-1 sm:flex-none bg-purple-600 text-white font-semibold py-1.5 px-4 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-1"
                                  >
                                    {isProcessing ? 'Updating...' : (<><Check className="h-3 w-3" />Update</>)}
                                  </button>
                                  <button
                                    onClick={() => handleDismiss(achievement)}
                                    disabled={isProcessing}
                                    className="flex-1 sm:flex-none bg-gray-100 text-gray-700 font-semibold py-1.5 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-1"
                                  >
                                    <X className="h-3 w-3" />Skip
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Sport Type */}
                          <div className={`flex items-center gap-2 text-xs text-gray-600 ${canUpdate ? 'mt-2' : ''}`}>
                            <span className="font-medium">{achievement.sportType}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
            <p className="text-gray-600">Loading achievements...</p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default Achievements;
