import { useState, useEffect } from 'react';
import { X, Sparkles, Info } from 'lucide-react';
import api from '../../api/axios';

// No hardcoded fallback - version must come from backend

const VERSION_NOTES = {
  title: 'Find Intervals & Edit Window Polish',
  date: '2026-08-24',
  features: [
    {
      icon: '🎚️',
      title: 'Compact Activity Range Slider',
      description: 'The warmup/cooldown range slider in Find Intervals now sits next to the Search by toggle under its own "Activity range" label, making the panel more compact.'
    },
    {
      icon: '🪟',
      title: 'Consistent Edit Window Size',
      description: 'The edit window opened from the calendar now matches the size of the activity/event window it was opened from, instead of appearing smaller.'
    },
    {
      icon: '📜',
      title: 'Full-Height Edit Form',
      description: 'The edit form now fills the available space in the window so you can always scroll all the way down to Activity Overview without content being cut off.'
    },
    {
      icon: '⛅',
      title: 'OpenMeteo Weather Toggle',
      description: 'Switch between SMHI and OpenMeteo forecasts per user in the weather settings. When OpenMeteo is enabled, search, forecast and radar location use OpenMeteo\'s global city and weather data while the frontend stays visually identical.'
    },
    {
      icon: '🏷️',
      title: 'Weather Source Badge',
      description: 'A green badge next to "Weather Forecast" shows whether SMHI or OpenMeteo is currently active for your location.'
    },
    {
      icon: '🌍',
      title: 'Global City Search with UTF-8 Support',
      description: 'Search cities worldwide through OpenMeteo geocoding, including correct handling of Swedish characters like å, ä and ö.'
    },
    {
      icon: '🛰️',
      title: 'LibreWXR Radar & Satellite Map',
      description: 'The dashboard now shows live radar/satellite animation directly from your self-hosted LibreWXR server with smooth crossfade transitions between frames.'
    },
    {
      icon: '📍',
      title: 'Radar Reloads on City Change',
      description: 'Changing weather station now resets the radar player to the first frame, forces a fresh tile load for the new location and starts playback automatically when ready.'
    },
    {
      icon: '📱',
      title: 'Mobile Menu Overlay Fix',
      description: 'The radar map is now constrained to its own stacking context so map controls no longer block the mobile hamburger menu, logout or other top-bar actions.'
    },
    {
      icon: '🔄',
      title: 'LibreWXR Auto-Update on Deploy',
      description: 'The deployment script now pulls the latest LibreWXR changes and rebuilds the Docker container automatically when a new version is available.'
    },
    {
      icon: '📱',
      title: 'Create and Edit Workouts on Mobile & Android',
      description: 'You can now create and edit workouts directly in the mobile web interface and the Android app, so you are no longer tied to a desktop browser to build your own sessions.'
    },
    {
      icon: '🔢',
      title: 'Simple Number Picker for Power, Pace and Intervals',
      description: 'A unified number picker is now used in the Workout Creator and Find Intervals. It gives you a scrollable, easy-to-use view with live watt or pace feedback while editing power and pace values.'
    },
    {
      icon: '🏃',
      title: 'Pace-Based Running Workouts in Intervals.icu',
      description: 'Run workouts now use the Intervals.icu workout builder text format with explicit Pace targets. This fixes the previous scaling issue where 100% threshold could be displayed as 88%, and ensures all steps show up correctly in Intervals.icu.'
    },
    {
      icon: '⏱️',
      title: 'Pace Tooltips in Calendar and Search',
      description: "Hovering over a workout chart in the calendar event detail or search results now shows the absolute pace for each step, e.g. '10min @ 100% (5:00/km)', when Use Pace is enabled."
    },
    {
      icon: '✅',
      title: 'Smoother WorkoutCreator Pace Editing',
      description: 'Opening a run pace workout in the Workout Creator now checks the Use Pace checkbox immediately without the previous "No Threshold Pace" warning flash, and waits for sport settings to load before validating.'
    },
    {
      icon: '🔧',
      title: 'Pace Formatting & Sport Settings Polish',
      description: 'Fixed a bug where pace values could display as "4:60" — seconds now correctly roll over to the next minute. Pace zones and threshold pace handling in Sport Settings have also been improved.'
    },
    {
      icon: '🚀',
      title: 'Performance & Reliability Improvements',
      description: 'Optimized Intervals.icu data fetching with parallel requests and improved rate limiting to prevent 429 errors. OpenAI rate limiter now uses non-blocking waits, while frontend timers and scroll handlers are properly cleaned up. Logout also uses soft navigation without a full page reload.'
    },
    {
      icon: '🔁',
      title: 'Share Workouts with Other Users',
      description: 'Share workouts from the global or custom library with users who have sharing enabled. Recipients get a notification where they can accept or decline, and the workout can be scheduled directly on the recipient calendar.'
    },
    {
      icon: '📋',
      title: 'Copy Workouts to Your Custom Library',
      description: 'Copy any workout from the workout library or your custom library into your own custom folder. If a workout with the same name already exists, a new version is created automatically (v1, v2, etc.).'
    },
    {
      icon: '✏️',
      title: 'Edit Custom Workouts',
      description: 'Open a custom workout in the Workout Creator to edit its intervals, category, sport type and description. Saving overwrites the original file, making it easy to iterate on your own workouts.'
    },
    {
      icon: '⚡',
      title: 'Smarter Workout Creator Defaults',
      description: 'New intervals and ramps get category-specific default power and durations. The short description is now auto-generated from the step structure, including rest and collapsed identical sets.'
    },
    {
      icon: '♻️',
      title: 'Smart Accept for Shared Workouts',
      description: 'When accepting a shared workout, the backend checks if an identical ZWO already exists and reuses it. If the structure is different, it creates the next available version instead of overwriting.'
    },
    {
      icon: '🧹',
      title: 'Clean Up Notifications on Delete',
      description: 'Deleting a custom workout removes only the pending notifications that were sent from that specific file by you. Shares sent by other users are not affected.'
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
