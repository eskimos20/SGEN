import { useState } from 'react';
import { X, Trophy, TrendingUp, Heart, Check } from 'lucide-react';
import api from '../../api/axios';
import { getSportEmoji } from '../../utils/sportTypeUtils';

const AchievementNotifier = ({ achievements, onAccept, onDismiss }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [processingIds, setProcessingIds] = useState(new Set());

  if (!achievements || achievements.length === 0) return null;

  const formatAchievementMessage = (achievement) => {
    const { achievementType, effortSeconds, effortWatts, newFtpValue, newLthrValue } = achievement;
    
    if (achievementType === 'FTP_UP' && newFtpValue && effortWatts && effortSeconds) {
      const minutes = Math.floor(effortSeconds / 60);
      const seconds = effortSeconds % 60;
      const timeStr = seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
      return `FTP ${newFtpValue}w from ${timeStr} at ${effortWatts}w`;
    }
    
    if (achievementType === 'LTHR_UP' && newLthrValue) {
      return `LTHR ${newLthrValue} bpm`;
    }
    
    return achievementType.replace('_', ' ');
  };

  const handleAccept = async (achievementId) => {
    setProcessingIds(prev => new Set(prev).add(achievementId));
    try {
      await api.post(`/statistics/achievement/${achievementId}/accept`);
      onAccept(achievementId);
    } catch (error) {
      console.error('Failed to accept achievement:', error);
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(achievementId);
        return newSet;
      });
    }
  };

  const handleDismiss = async (achievementId) => {
    setProcessingIds(prev => new Set(prev).add(achievementId));
    try {
      await api.post(`/statistics/achievement/${achievementId}/dismiss`);
      onDismiss(achievementId);
    } catch (error) {
      console.error('Failed to dismiss achievement:', error);
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(achievementId);
        return newSet;
      });
    }
  };

  const handleDismissAll = () => {
    achievements.forEach(achievement => handleDismiss(achievement.id));
  };

  return (
    <div className="w-full">
      {/* Notification bubble */}
      <div
        className={`
          relative bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-2xl
          transition-all duration-300
          ${isExpanded ? 'w-full' : 'w-auto'}
        `}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              <span className="font-semibold">
                {achievements.length === 1 ? 'New Achievement!' : `${achievements.length} New Achievements!`}
              </span>
            </div>
            <button
              onClick={handleDismissAll}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              title="Dismiss all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          {isExpanded && (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {achievements.map((achievement) => {
                const isProcessing = processingIds.has(achievement.id);
                const sportEmoji = getSportEmoji(achievement.sportType);
                const isFtpAchievement = achievement.achievementType === 'FTP_UP';
                const isLthrAchievement = achievement.achievementType === 'LTHR_UP';
                const oldValue = isFtpAchievement ? achievement.oldFtpValue : achievement.oldLthrValue;
                const newValue = isFtpAchievement ? achievement.newFtpValue : achievement.newLthrValue;
                const delta = newValue && oldValue ? newValue - oldValue : null;
                const isAtCurrent = oldValue && newValue && newValue === oldValue;
                
                return (
                  <div key={achievement.id} className="bg-white/10 rounded-lg p-3 space-y-2">
                    {/* Activity info */}
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{sportEmoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{achievement.activityName}</p>
                        <p className="text-xs text-white/80">{achievement.achievementDate}</p>
                      </div>
                    </div>

                    {/* Achievement message */}
                    <div className="flex items-center gap-2">
                      {isFtpAchievement && <TrendingUp className="h-4 w-4 flex-shrink-0" />}
                      {isLthrAchievement && <Heart className="h-4 w-4 flex-shrink-0" />}
                      <span className="text-sm font-medium">{formatAchievementMessage(achievement)}</span>
                    </div>
                    
                    {/* Value comparison */}
                    {oldValue && newValue && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-white/70">Update {isFtpAchievement ? 'FTP' : 'LTHR'}:</span>
                        <span className="font-mono">{oldValue}</span>
                        <span className="text-white/70">→</span>
                        <span className="font-mono font-bold">{newValue}</span>
                        {delta && (
                          <span className={delta > 0 ? "text-green-300 font-medium" : "text-red-300 font-medium"}>
                            ({delta > 0 ? '+' : ''}{delta}{isFtpAchievement ? 'w' : ' bpm'})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action buttons OR already-current message */}
                    {isAtCurrent ? (
                      <div className="flex items-center gap-1 pt-1 text-sm font-medium text-white/90">
                        <Check className="h-3 w-3" />
                        Your {isFtpAchievement ? 'FTP' : 'LTHR'} is already your current
                      </div>
                    ) : (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleAccept(achievement.id)}
                          disabled={isProcessing}
                          className="flex-1 bg-white text-purple-600 font-semibold py-1.5 px-3 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-1"
                        >
                          {isProcessing ? (
                            'Updating...'
                          ) : (
                            <>
                              <Check className="h-3 w-3" />
                              Update
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDismiss(achievement.id)}
                          disabled={isProcessing}
                          className="flex-1 bg-white/20 text-white font-semibold py-1.5 px-3 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-1"
                        >
                          <X className="h-3 w-3" />
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Glow effect */}
      <div className="absolute inset-0 bg-purple-400/20 rounded-xl blur-xl -z-10 animate-pulse" />
    </div>
  );
};

export default AchievementNotifier;
