import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart3, User, Settings, ArrowRight, Sparkles, Smartphone, Download, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { isCapacitor, getServerBaseUrl } from '../config/api.config';
import { getToken } from '../services/tokenService.js';
import WeatherWidget from '../components/shared/WeatherWidget';
import VersionNotifier from '../components/notifications/VersionNotifier';
import AchievementNotifier from '../components/notifications/AchievementNotifier';

const Dashboard = () => {
  const { user, hasIntervalsConfig, loading: authLoading } = useAuth();
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [aiUsage, setAiUsage] = useState(null);
  const [showVersionNotifier, setShowVersionNotifier] = useState(false);
  const [pendingAchievements, setPendingAchievements] = useState([]);
  
  // Android APK download state
  const [apkAvailable, setApkAvailable] = useState(false);
  const [apkUrl, setApkUrl] = useState(null);
  const [apkVersion, setApkVersion] = useState(null);
  const [installedApkVersion, setInstalledApkVersion] = useState(null);
  const [showApkUpdate, setShowApkUpdate] = useState(false);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  useEffect(() => {
    // Wait for auth to finish loading first
    if (authLoading) {
      return;
    }
    
    // Only fetch if user has intervals config
    if (!hasIntervalsConfig) {
      setLoadingProfile(false);
      return;
    }
    
    // Fetch athlete profile from Intervals.icu API - no caching
    const fetchProfile = async () => {
      try {
        const response = await api.get('/statistics/athlete-profile');
        setAthleteProfile(response.data);
      } catch (err) {
        // Silently fail
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchProfile();
    
    // Fetch AI usage if user has OpenAI configured
    if (user?.hasOpenAIConfig) {
      const fetchAiUsage = async () => {
        try {
          const response = await api.get('/statistics/my-ai-usage');
          setAiUsage(response.data);
        } catch (err) {
          // Silently fail
        }
      };
      fetchAiUsage();
    }
    
    // Check if we should show version notifier
    const checkVersion = async () => {
      try {
        // Get current version from backend
        const versionResponse = await api.get('/statistics/current-version');
        const currentVersion = versionResponse.data.version;
        
        // Check database if user has seen this version
        const response = await api.get(`/statistics/version-seen/${currentVersion}`);
        const hasSeen = response.data.hasSeen;
        
        // Show notifier if user hasn't seen this version
        if (!hasSeen) {
          setShowVersionNotifier(true);
        }
      } catch (error) {
        console.error('Failed to check version:', error);
        // No fallback - version notifier requires database to work
      }
    };
    
    checkVersion();
    
    // Check for pending achievements
    const checkAchievements = async () => {
      try {
        const response = await api.get('/statistics/pending-achievements');
        const pending = response.data.pending;
        if (pending && pending.length > 0) {
          setPendingAchievements(pending);
        }
      } catch (error) {
        console.error('Failed to check achievements:', error);
        // Silently fail
      }
    };
    
    checkAchievements();
    
    // Check if Android APK is available for download
    const checkApkStatus = async () => {
      try {
        const response = await api.get('/downloads/android/status');
        if (response.data.available) {
          setApkAvailable(true);
          setApkVersion(response.data.version || null);
          // Construct full URL for download using server base URL
          const baseUrl = getServerBaseUrl();
          setApkUrl(`${baseUrl}${response.data.downloadUrl}`);
          
          // If we're in Capacitor app, check installed version
          if (isCapacitor) {
            try {
              // Try to get version from Capacitor App plugin
              const { App } = await import('@capacitor/app');
              const appInfo = await App.getInfo();
              setInstalledApkVersion(appInfo.version);
              
              // Only show update if server version is different from installed version
              if (response.data.version && response.data.version !== appInfo.version) {
                setShowApkUpdate(true);
              }
            } catch (err) {
              console.log('Could not get app version:', err);
              // If we can't determine version, show update just in case
              setShowApkUpdate(true);
            }
          }
        }
      } catch (error) {
        console.error('APK status check failed:', error);
        console.error('Error details:', error.response?.status, error.response?.data, error.message);
      }
    };
    
    checkApkStatus();
  }, [authLoading, hasIntervalsConfig, user?.hasOpenAIConfig]);
  
  const handleAcceptAchievement = (achievementId) => {
    // Remove this achievement from the list
    setPendingAchievements(prev => prev.filter(a => a.id !== achievementId));
    // Refresh athlete profile to get updated FTP/LTHR
    const fetchProfile = async () => {
      try {
        const response = await api.get('/statistics/athlete-profile');
        setAthleteProfile(response.data);
      } catch (err) {
        // Silently fail
      }
    };
    fetchProfile();
  };
  
  const handleDismissAchievement = (achievementId) => {
    // Remove this achievement from the list
    setPendingAchievements(prev => prev.filter(a => a.id !== achievementId));
  };

  // Don't show anything until loading is complete
  if (loadingProfile || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const profileImage = athleteProfile?.athlete?.profile_medium;
  const athleteName = athleteProfile?.athlete?.name || user?.username;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome{athleteName ? `, ${athleteName}` : ''}</p>
        </div>

        {/* Notification Stack - Fixed position top right */}
        <div className="fixed top-20 inset-x-4 sm:left-auto sm:right-4 sm:w-full sm:max-w-md z-50 space-y-4">
          <AchievementNotifier 
            achievements={pendingAchievements}
            onAccept={handleAcceptAchievement}
            onDismiss={handleDismissAchievement}
          />
          <VersionNotifier 
            isVisible={showVersionNotifier} 
            onDismiss={() => setShowVersionNotifier(false)} 
          />
        </div>

      {/* Android APK Download/Update Section - Top placement for mobile visibility */}
      {/* Show download for web mobile users, show update for Capacitor app users */}
      {isMobile && apkAvailable && apkUrl && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl sm:shadow-sm border border-green-200 p-3 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-lg flex-shrink-0">
              <Smartphone className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              {isCapacitor ? (
                // Capacitor app user - show update message if needed
                showApkUpdate ? (
                  <>
                    <h3 className="font-semibold text-gray-900 mb-1">App Update Available</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      A new version ({apkVersion}) is available. You have version {installedApkVersion}.
                      Update to get the latest features and improvements.
                    </p>
                    <button
                      onClick={async () => {
                        // Download APK in-app and trigger installation
                        const directFileUrl = `${getServerBaseUrl()}/downloads/sgen-android.apk`;
                        
                        try {
                          // Download the APK file
                          const response = await fetch(directFileUrl);
                          if (!response.ok) {
                            throw new Error(`Download failed: ${response.status}`);
                          }
                          
                          const arrayBuffer = await response.arrayBuffer();
                          
                          if (arrayBuffer.byteLength === 0) {
                            throw new Error('Downloaded APK is empty');
                          }
                          
                          // Save using Filesystem - try multiple directories
                          const { Filesystem, Directory } = await import('@capacitor/filesystem');
                          
                          // Convert to base64
                          const uint8Array = new Uint8Array(arrayBuffer);
                          let binary = '';
                          for (let i = 0; i < uint8Array.byteLength; i++) {
                            binary += String.fromCharCode(uint8Array[i]);
                          }
                          const base64Data = btoa(binary);
                          
                          const fileName = `sgen-android-${apkVersion || 'latest'}.apk`;
                          let saved = false;
                          let savedUri = null;
                          let savedToPublicDownloads = false;
                          let errors = [];
                          
                          // First, try to save to public Downloads directory using absolute path
                          try {
                            await Filesystem.writeFile({
                              path: `Download/${fileName}`,
                              data: base64Data,
                              directory: Directory.ExternalStorage
                            });
                            
                            savedUri = `file:///storage/emulated/0/Download/${fileName}`;
                            saved = true;
                            savedToPublicDownloads = true;
                          } catch (publicErr) {
                            errors.push(`Public Downloads: ${publicErr.message}`);
                            
                            // Fall back to app directories
                            const directories = [
                              Directory.External,
                              Directory.Documents,
                              Directory.Cache
                            ];
                            
                            for (const dir of directories) {
                              try {
                                await Filesystem.writeFile({
                                  path: fileName,
                                  data: base64Data,
                                  directory: dir
                                });
                                
                                const fileUri = await Filesystem.getUri({
                                  path: fileName,
                                  directory: dir
                                });
                                
                                saved = true;
                                savedUri = fileUri.uri;
                                break;
                                
                              } catch (err) {
                                errors.push(`${dir}: ${err.message}`);
                              }
                            }
                          }
                          
                          if (!saved) {
                            throw new Error('Failed directories:\n' + errors.join('\n'));
                          }
                          
                          // If saved to public Downloads, just show success message
                          // If saved to app directory, use Share dialog
                          if (savedToPublicDownloads) {
                            alert(`✓ APK saved to Downloads!\n\nFile: ${fileName}\nSize: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB\nLocation: /storage/emulated/0/Download/${fileName}\n\nTo install:\n1. Open your file manager\n2. Go to Downloads folder\n3. Tap the APK file\n4. Allow installation from this source`);
                          } else {
                            // Share the file so user can save to Downloads or install
                            try {
                              const { Share } = await import('@capacitor/share');
                              await Share.share({
                                title: 'SGEN App Update',
                                text: `SGEN Android App v${apkVersion || 'latest'}`,
                                url: savedUri,
                                dialogTitle: 'Save or Install APK'
                              });
                            } catch (shareErr) {
                              // Share might not work with file URIs on all devices
                              alert(`✓ APK saved to app folder!\nFile: ${fileName}\nSize: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB\n\nTo install:\n1. Open your file manager\n2. Navigate to: Android/data/com.sgen.app/files/\n3. Tap the APK file\n4. Allow installation from this source`);
                            }
                          }
                          
                        } catch (err) {
                          console.error('Download error:', err);
                          alert('Failed to download update: ' + err.message);
                          
                          // Fallback to browser download
                          try {
                            const { Browser } = await import('@capacitor/browser');
                            await Browser.open({ url: directFileUrl });
                          } catch (browserErr) {
                            window.open(directFileUrl, '_blank');
                          }
                        }
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Update App
                    </button>
                  </>
                ) : (
                  // Up to date - show minimal message
                  <>
                    <h3 className="font-semibold text-gray-900 mb-1">App Up to Date</h3>
                    <p className="text-sm text-gray-600">
                      You have the latest version ({installedApkVersion || apkVersion}).
                    </p>
                  </>
                )
              ) : (
                // Web mobile user - show download option
                <>
                  <h3 className="font-semibold text-gray-900 mb-1">Get the Android App</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Download our Android app for a better mobile experience. Install it directly - no Google Play needed.
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const token = getToken();
                        if (!token) {
                          alert('Please log in to download the app');
                          return;
                        }
                        
                        // Download using fetch
                        const response = await fetch(apkUrl, {
                          headers: { 'Authorization': `Bearer ${token}` }
                        });
                        
                        if (!response.ok) throw new Error('Download failed');
                        
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'sgen-android.apk';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error('Download error:', err);
                        alert('Failed to download APK. Please try again.');
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <Download className="h-4 w-4" />
                    Download APK
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {hasIntervalsConfig && (
              <Link to="/statistics" className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6 hover:shadow-xl transition-shadow group block">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary-100 rounded-lg">
                    <BarChart3 className="h-6 w-6 text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">Statistics</h3>
                    <p className="text-sm text-gray-600">View and analyze your training data</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-primary-600 transition-colors" />
                </div>
              </Link>
            )}

            <Link to="/profile" className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6 hover:shadow-xl transition-shadow group block">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <User className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Profile</h3>
                  <p className="text-sm text-gray-600">Configure your Intervals.icu settings</p>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors" />
              </div>
            </Link>

            {user?.role === 'ADMIN' && (
              <Link to="/admin" className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6 hover:shadow-xl transition-shadow group block">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Settings className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">Admin Panel</h3>
                    <p className="text-sm text-gray-600">Manage users and OpenAI settings</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
                </div>
              </Link>
            )}
          </div>

          {/* Weather Widget - Horizontal Layout */}
          <WeatherWidget />

          {/* AI Usage Statistics */}
          {user?.hasOpenAIConfig && aiUsage && (
            <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Sparkles className="h-5 w-5 text-amber-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">AI Usage</h2>
              </div>
              
              {aiUsage.monthlyUsage && aiUsage.monthlyUsage.length > 0 ? (
                <div className="space-y-4">
                  {/* Monthly breakdown */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 font-medium text-gray-600">Month</th>
                          <th className="text-right py-2 font-medium text-gray-600">Tokens</th>
                          <th className="text-right py-2 font-medium text-gray-600">Requests</th>
                          <th className="text-right py-2 font-medium text-gray-600">Cost (SEK)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiUsage.monthlyUsage.map((month, idx) => (
                          <tr key={idx} className={idx === 0 ? 'bg-amber-50' : ''}>
                            <td className="py-2 text-gray-900">
                              {month.monthName} {month.year}
                              {idx === 0 && <span className="ml-2 text-xs text-amber-600 font-medium">(current)</span>}
                            </td>
                            <td className="py-2 text-right text-gray-700">{month.totalTokens?.toLocaleString('en-US')}</td>
                            <td className="py-2 text-right text-gray-700">{month.requestCount}</td>
                            <td className="py-2 text-right text-gray-900 font-medium">{Number(month.costSek).toFixed(2)} kr</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-300 font-semibold">
                          <td className="py-2 text-gray-900">Total</td>
                          <td className="py-2 text-right text-gray-900">{aiUsage.totalTokens?.toLocaleString('en-US')}</td>
                          <td className="py-2 text-right text-gray-900">{aiUsage.totalRequests}</td>
                          <td className="py-2 text-right text-gray-900">{Number(aiUsage.totalCostSek).toFixed(2)} kr</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  
                  {/* Current active model */}
                  {aiUsage.currentModel && (
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Active model:</p>
                      <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs rounded font-medium">
                        {aiUsage.currentModel}
                      </span>
                    </div>
                  )}

                  {/* Model usage */}
                  {aiUsage.modelUsage && aiUsage.modelUsage.length > 0 && (
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-2">Models used:</p>
                      <div className="flex flex-wrap gap-2">
                        {aiUsage.modelUsage.map((model, idx) => (
                          <span key={idx} className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                            {model.model} ({model.totalTokens?.toLocaleString('en-US')} tokens)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-400 mt-2">
                    Exchange rate: 1 USD = {aiUsage.usdToSekRate} SEK
                  </p>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No AI usage recorded yet.</p>
              )}
            </div>
          )}

          {/* Quick Start Guide */}
          <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Start Guide</h2>
            {hasIntervalsConfig ? (
              <div className="flex items-start gap-3 mb-4 text-gray-600">
                <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-medium">✓</span>
                <span>Your Intervals.icu is connected! Data syncs automatically when you visit Statistics.</span>
              </div>
            ) : (
              <ol className="space-y-3 text-gray-600 mb-4">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-medium">1</span>
                  <span>Go to <strong>Profile</strong> and add your Intervals.icu API key and Athlete ID</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-medium">2</span>
                  <span>Click <strong>Test Connection</strong> to verify your Intervals.icu account, then save</span>
                </li>
              </ol>
            )}
            <ol className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-medium">3</span>
                <span>Go to <strong>Statistics</strong> to add <strong>Sports</strong>, map activity types, and set LTHR, max HR, and heart rate / power zones</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-medium">4</span>
                <span>Navigate to <strong>Statistics</strong> to view your training data and fetch from Intervals.icu</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-medium">5</span>
                <span>Optional: Add <strong>OpenAI</strong> and <strong>Strava</strong> credentials in Profile for AI-powered analysis and Strava integration</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
