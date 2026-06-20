import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Loader2, Video, AlertCircle, Download } from 'lucide-react';
import { usePoseDetection } from '../../hooks/usePoseDetection';
import { useBikeFitAnalysis } from '../../hooks/useBikeFitAnalysis';
import { drawPose } from '../../utils/bikeFitDraw';
import AngleDisplay from './AngleDisplay';
import AIAnalysis from './AIAnalysis';

const BikeFitAnalyzeTabNew = ({
  videoUrl,
  videoRef,
  videoMetadata,
  ridingStyle
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const detectedSideRef = useRef(null);

  // Draw the processed frame + skeleton on the same canvas, in sync, zero lag.
  const drawResults = useCallback((results) => {
    if (canvasRef.current) {
      drawPose(canvasRef.current, results, detectedSideRef.current);
    }
  }, []);

  const { 
    isLoaded, 
    isProcessing, 
    landmarks, 
    error: poseError,
    processFrame,
    startContinuousDetection,
    stopContinuousDetection,
    warmup,
    reset: resetPose
  } = usePoseDetection(drawResults);

  const { angles, detectedSide, reset: resetAngles } = useBikeFitAnalysis(landmarks, videoSize);

  // Keep the latest detected side available to the (non-React) draw callback.
  useEffect(() => {
    detectedSideRef.current = detectedSide;
  }, [detectedSide]);

  // Warm up the pose model on the first decoded frame so playback runs at full
  // speed from the start (no slow warmup ramp).
  const warmedUpRef = useRef(false);
  useEffect(() => {
    warmedUpRef.current = false;
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLoaded || warmedUpRef.current) return;

    const doWarmup = () => {
      if (warmedUpRef.current || video.readyState < 2) return;
      warmedUpRef.current = true;
      warmup(video, 3);
    };

    if (video.readyState >= 2) {
      doWarmup();
    } else {
      video.addEventListener('loadeddata', doWarmup, { once: true });
      return () => video.removeEventListener('loadeddata', doWarmup);
    }
  }, [isLoaded, warmup, videoRef, videoUrl]);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      
      const handleLoadedMetadata = () => {
        setVideoSize({
          width: video.videoWidth,
          height: video.videoHeight
        });
      };

      const handlePlay = () => {
        setIsPlaying(true);
        // Normal speed: sync is guaranteed by canvas compositing (overlay is drawn
        // on the exact processed frame), so no slow-motion is needed.
        video.playbackRate = 1.0;
        startContinuousDetection(video);
      };

      const handlePause = () => {
        setIsPlaying(false);
        stopContinuousDetection();
      };

      const handleEnded = () => {
        setIsPlaying(false);
        stopContinuousDetection();
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('ended', handleEnded);

      if (video.readyState >= 1) {
        handleLoadedMetadata();
      }

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('ended', handleEnded);
      };
    }
  }, [videoRef, startContinuousDetection, stopContinuousDetection]);

  const handlePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.playbackRate = 1.0;
      videoRef.current.play();
    }
  };

  const handleReset = () => {
    if (!videoRef.current) return;
    
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    stopContinuousDetection();
    resetPose();
    resetAngles();
    setIsPlaying(false);

    // Clear the composited frame so the underlying video is visible again.
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleDownload = () => {
    if (!videoUrl) return;
    
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `bikefit-video-${new Date().toISOString().slice(0, 10)}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
        {!isLoaded && (
          <div className="bg-blue-50 border border-blue-200 sm:rounded-lg p-3 sm:p-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            <div>
              <p className="text-blue-900 font-medium">Loading AI Pose Detection...</p>
              <p className="text-blue-700 text-sm">This may take a few seconds on first load</p>
            </div>
          </div>
        )}

        {poseError && (
          <div className="bg-red-50 border border-red-200 sm:rounded-lg p-3 sm:p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-900 font-medium">Pose Detection Error</p>
              <p className="text-red-700 text-sm">{poseError}</p>
            </div>
          </div>
        )}

        {videoMetadata && (
          <div className="bg-blue-50 border border-blue-200 sm:rounded-lg p-3 sm:p-4">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Video className="h-4 w-4" />
              Video Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <span className="text-gray-600">Resolution:</span>
                <span className="ml-2 font-medium text-gray-900">{videoMetadata.resolution}</span>
              </div>
              <div>
                <span className="text-gray-600">FPS:</span>
                <span className="ml-2 font-medium text-gray-900">{videoMetadata.fps}</span>
              </div>
              <div>
                <span className="text-gray-600">Duration:</span>
                <span className="ml-2 font-medium text-gray-900">{videoMetadata.duration}</span>
              </div>
              <div>
                <span className="text-gray-600">AI Status:</span>
                <span className={`ml-2 font-medium ${isLoaded ? 'text-green-600' : 'text-orange-600'}`}>
                  {isLoaded ? 'Ready' : 'Loading...'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-green-500 to-green-600 text-white sm:rounded-lg p-3 sm:p-6 shadow-lg">
          <h2 className="text-2xl font-bold mb-2">🤖 AI-Powered Analysis</h2>
          <p className="text-sm opacity-90">
            Play the video to automatically detect your body position and analyze bike fit angles in real-time
          </p>
        </div>

        <div ref={containerRef} className="relative bg-black sm:rounded-lg overflow-hidden">
          {/* Raw video drives playback + pose input; the canvas draws the frame on top so
              image and overlay stay perfectly in sync. The video sits behind the canvas. */}
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full"
            playsInline
            muted
            preload="auto"
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
          
          {isProcessing && (
            <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Analyzing
            </div>
          )}
        </div>

        <div className="flex gap-2 sm:gap-3">
          <button
            onClick={handlePlayPause}
            disabled={!isLoaded}
            className="flex-1 px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">Pause</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">Play & Analyze</span>
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <Download className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            onClick={handleReset}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

        {!landmarks && isLoaded && !isPlaying && (
          <div className="bg-yellow-50 border border-yellow-200 sm:rounded-lg p-3 sm:p-4">
            <p className="text-yellow-900 text-sm">
              <strong>Tip:</strong> Press "Play & Analyze" to start the AI pose detection. 
              Make sure your full body is visible in the video for best results.
            </p>
          </div>
        )}
      </div>

      <div>
        <AngleDisplay angles={angles} ridingStyle={ridingStyle} detectedSide={detectedSide} />
      </div>
      </div>

      {/* AI Analysis - Full width section */}
      <div className="w-full">
        <AIAnalysis angles={angles} ridingStyle={ridingStyle} isVideoProcessing={isProcessing || isPlaying} />
      </div>
    </div>
  );
};

export default BikeFitAnalyzeTabNew;
