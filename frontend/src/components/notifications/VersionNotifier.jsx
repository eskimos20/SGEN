import { useState, useEffect } from 'react';
import { X, Sparkles, Info } from 'lucide-react';
import api from '../../api/axios';

// No hardcoded fallback - version must come from backend

const VERSION_NOTES = {
  title: 'Strava Controls & Accurate Achievement Baselines',
  date: '2026-06-29',
  features: [
    {
      icon: '⚙️',
      title: 'Enable/Disable Strava Integration',
      description: 'Profile settings now include a Strava toggle just like OpenAI. Disabling Strava clears stored OAuth tokens and stops the app from calling Strava endpoints, preventing unnecessary error logs.'
    },
    {
      icon: '🏆',
      title: 'Achievement FTP/LTHR Compared to Your Current Values',
      description: 'FTP and LTHR achievements now compare against your actual current profile values instead of the historic per-activity values from Intervals.icu. This means you see the real delta (e.g. 291 → 284 = -7), and when the suggested value already matches your current setting you get a clear “already your current” message instead of Update/Skip buttons.'
    }
  ]
};


const VersionNotifier = ({ isVisible, onDismiss }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [versionMarkedAsSeen, setVersionMarkedAsSeen] = useState(false);

  useEffect(() => {
    // Fetch current version from backend
    const fetchVersion = async () => {
      try {
        const response = await api.get('/statistics/current-version');
        if (response.data.version) {
          setCurrentVersion(response.data.version);
        }
      } catch (error) {
        console.error('Failed to fetch current version:', error);
        // No fallback - version notifier requires database to work
      }
    };

    if (isVisible) {
      fetchVersion();
      // Auto-expand after a short delay, but only on non-mobile screens
      const timer = setTimeout(() => setIsExpanded(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isVisible || !currentVersion) return null;

  const handleDismiss = async () => {
    // Mark version as seen and close the notifier
    if (!versionMarkedAsSeen) {
      try {
        await api.post('/statistics/version-seen', { version: currentVersion });
        setVersionMarkedAsSeen(true);
      } catch (error) {
        // Silently fail - version notifier requires database to work
      }
    }
    onDismiss();
  };

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="w-full">
      {/* Notification bubble */}
      <div
        className={`
          relative bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl shadow-2xl
          transition-all duration-300 cursor-pointer
          ${isExpanded ? 'w-full' : 'w-auto'}
          animate-none
        `}
        onClick={handleToggleExpand}
      >
        <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="font-semibold text-xs sm:text-sm">What's New</span>
          </div>
          
          <div className="flex items-center gap-2">
            {!isExpanded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleExpand();
                }}
                className="text-xs bg-white/20 px-2 py-1 rounded-full hover:bg-white/30 transition-colors"
              >
                v{currentVersion}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-white/20 p-3 sm:p-4 bg-black/10 max-h-[50vh] sm:max-h-[70vh] overflow-y-auto">
            <div className="space-y-3 sm:space-y-4">
              {/* Header */}
              <div>
                <h3 className="font-bold text-base sm:text-lg mb-1">{VERSION_NOTES.title}</h3>
                <p className="text-xs sm:text-sm text-white/80">Version {currentVersion} • {VERSION_NOTES.date}</p>
              </div>

              {/* Features */}
              <div className="space-y-2 sm:space-y-3">
                <h4 className="font-semibold text-xs sm:text-sm text-white/90">✨ New Features</h4>
                {VERSION_NOTES.features.map((feature, index) => (
                  <div key={index} className="flex gap-2 sm:gap-3">
                    <span className="text-base sm:text-lg">{feature.icon}</span>
                    <div className="flex-1">
                      <p className="font-medium text-xs sm:text-sm">{feature.title}</p>
                      <p className="text-xs text-white/80 leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Glow effect */}
      <div className="absolute inset-0 bg-blue-400/20 rounded-xl blur-xl -z-10 animate-pulse" />
    </div>
  );
};

export default VersionNotifier;
