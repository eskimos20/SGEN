import { useState, useEffect } from 'react';
import { Camera, Video, Upload, AlertCircle, Info } from 'lucide-react';
import { isCapacitor } from '../config/api.config';
import { useBikeFitVideo } from '../hooks/useBikeFitVideo';
import { useBikeFitRecording } from '../hooks/useBikeFitRecording';
import BikeFitUploadTab from '../components/bikefit/BikeFitUploadTab';
import BikeFitRecordTab from '../components/bikefit/BikeFitRecordTab';
import BikeFitAnalyzeTab from '../components/bikefit/BikeFitAnalyzeTab';

const BikeFit = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [error, setError] = useState(null);
  const [ridingStyle, setRidingStyle] = useState('road');
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileInfo, setShowMobileInfo] = useState(
    () => localStorage.getItem('bikefit_hide_camera_tips') !== 'true'
  );

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
    
    // Check camera requirements
    if (isMobile) {
      if (isCapacitor) {
        // In Capacitor app, request camera permissions
        const requestCameraPermission = async () => {
          try {
            const { Camera } = await import('@capacitor/camera');
            const { Camera: CapCamera } = await import('@capacitor/camera');
            const permission = await CapCamera.requestPermissions({ permissions: ['camera'] });
            if (permission.camera !== 'granted') {
              setError('⚠️ Camera permission is required for video recording. Please enable it in app settings.');
            }
          } catch (err) {
            console.log('Camera plugin not available, falling back to web API');
          }
        };
        requestCameraPermission();
      } else if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        // Web mobile requires HTTPS
        setError('⚠️ Camera requires HTTPS. Please access this page via https://');
      }
    }
  }, [isMobile]);

  const videoHook = useBikeFitVideo();
  
  const recordingHook = useBikeFitRecording(
    videoHook.videoRef,
    (url) => {
      videoHook.setVideoUrl(url);
      videoHook.loadVideo(url);
      setActiveTab('analyze');
    }
  );

  useEffect(() => {
    return () => {
      if (videoHook.videoUrl) {
        URL.revokeObjectURL(videoHook.videoUrl);
      }
    };
  }, [videoHook.videoUrl]);

  // Lazily initialize the camera (permission + enumeration) only when the user
  // opens the Record tab. Avoids turning on the camera for upload/analyze flows.
  useEffect(() => {
    if (activeTab === 'record') {
      recordingHook.initCamera();
    }
  }, [activeTab, recordingHook.initCamera]);

  const handleFileUpload = (file) => {
    videoHook.resetVideo();
    videoHook.handleFileUpload(file, () => setActiveTab('analyze'));
  };

  const handleStartCamera = async () => {
    try {
      videoHook.resetVideo();
      await recordingHook.startCamera();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">BikeFit Analysis</h1>
          <p className="text-gray-600 mt-1">Analyze your bike position and get personalized recommendations</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-700">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-sm text-red-600 hover:text-red-800 mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {isMobile && showMobileInfo && activeTab === 'record' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-blue-900 font-medium mb-2">📱 {isCapacitor ? 'App Camera Tips' : 'Mobile Camera Tips'}</p>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                {isCapacitor ? (
                  // Capacitor app specific tips
                  <>
                    <li>Make sure you've <strong>allowed camera permission</strong> in the app settings</li>
                    <li>Allow microphone permission when recording video</li>
                    <li>If camera doesn't work, try closing other apps using the camera</li>
                    <li>Grant permissions in Settings → Apps → SGEN → Permissions if needed</li>
                  </>
                ) : (
                  // Web mobile tips
                  <>
                    <li>Make sure you're using <strong>HTTPS</strong> (check for 🔒 in address bar)</li>
                    <li>Allow camera permission when prompted by your browser</li>
                    <li>If camera doesn't work, try closing other apps using the camera</li>
                    <li>Chrome and Firefox are recommended browsers</li>
                  </>
                )}
              </ul>
              <button
                onClick={() => {
                  localStorage.setItem('bikefit_hide_camera_tips', 'true');
                  setShowMobileInfo(false);
                }}
                className="text-sm text-blue-600 hover:text-blue-800 mt-2 underline"
              >
                Got it, don't show again
              </button>
            </div>
          </div>
        )}

        {!videoHook.videoUrl && (
          <div className="bg-white rounded-lg sm:shadow-sm border border-gray-200 p-3 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Your Riding Style</h2>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setRidingStyle('road')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  ridingStyle === 'road'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Road
              </button>
              <button
                onClick={() => setRidingStyle('aero')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  ridingStyle === 'aero'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Aero/TT
              </button>
              <button
                onClick={() => setRidingStyle('mtb')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  ridingStyle === 'mtb'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                MTB
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'upload'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Upload className="h-5 w-5 inline mr-2" />
              Upload Video
            </button>
            <button
              onClick={() => setActiveTab('record')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'record'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Camera className="h-5 w-5 inline mr-2" />
              Record Video
            </button>
            {videoHook.videoUrl && (
              <button
                onClick={() => setActiveTab('analyze')}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === 'analyze'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Video className="h-5 w-5 inline mr-2" />
                Analyze
              </button>
            )}
          </div>

          <div className="p-6">
            {activeTab === 'upload' && (
              <BikeFitUploadTab onFileUpload={handleFileUpload} />
            )}

            {activeTab === 'record' && (
              <BikeFitRecordTab
                {...recordingHook}
                startCamera={handleStartCamera}
                videoRef={videoHook.videoRef}
              />
            )}

            {activeTab === 'analyze' && videoHook.videoUrl && (
              <BikeFitAnalyzeTab
                videoUrl={videoHook.videoUrl}
                videoRef={videoHook.videoRef}
                videoMetadata={videoHook.videoMetadata}
                ridingStyle={ridingStyle}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BikeFit;
