import { useState, useRef, useEffect, useCallback } from 'react';
import { installWasmLogFilter } from '../utils/suppressWasmLogs';

// Suppress verbose MediaPipe WASM logging early.
installWasmLogFilter();

// MediaPipe Pose will be loaded dynamically from CDN.
// Pin the version so a CDN release never silently changes model behaviour.
const MEDIAPIPE_POSE_VERSION = '0.5.1675469404';
let Pose = null;

export const usePoseDetection = (onResultsDraw) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [landmarks, setLandmarks] = useState(null);
  const [error, setError] = useState(null);
  
  const poseRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isInitializingRef = useRef(false);
  const warmingUpRef = useRef(false);

  // Keep the latest draw callback in a ref so onResults (registered once) always
  // calls the current function without needing to re-register.
  const drawRef = useRef(onResultsDraw);
  useEffect(() => {
    drawRef.current = onResultsDraw;
  }, [onResultsDraw]);

  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (isInitializingRef.current) {
      return;
    }
    isInitializingRef.current = true;

    const loadMediaPipe = async () => {
      try {
        // Load MediaPipe Pose from CDN
        if (!window.Pose) {
          const script = document.createElement('script');
          script.src = `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_POSE_VERSION}/pose.js`;
          script.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        Pose = window.Pose;

        // Detect Firefox and apply compatibility settings
        const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
        
        const pose = new Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_POSE_VERSION}/${file}`;
          }
        });

        // Firefox-specific configuration to avoid WebGL issues
        const options = {
          modelComplexity: 1,  // Use lower complexity for Firefox compatibility
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.6,  // Slightly lower threshold for better compatibility
          minTrackingConfidence: 0.6
        };

        // Try to initialize with default settings first
        let usedCPUFallback = false;
        try {
          pose.setOptions(options);
          await pose.initialize();
          console.log('MediaPipe initialized successfully - GPU mode');
        } catch (initializationError) {
          console.warn('MediaPipe initialization failed:', initializationError.message);
          
          // Check for various WebGL-related errors
          const isWebGLError = initializationError.message.includes('loadGraph') || 
                              initializationError.message.includes('WebGL') ||
                              initializationError.message.includes('undefined') ||
                              initializationError.message.includes('FEATURE_FAILURE_EGL_NO_CONFIG') ||
                              initializationError.message.includes('FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS') ||
                              initializationError.message.includes('Failed to create WebGL context') ||
                              initializationError.message.includes('ANGLE') ||
                              initializationError.message.includes('Exhausted GL driver');
          
          if (isWebGLError) {
            console.warn('WebGL compatibility issue detected, attempting CPU-only fallback');
            
            // Retry with CPU-only configuration
            try {
              pose.setOptions({
                ...options,
                // Force CPU processing by avoiding GPU-specific features
                modelComplexity: 0,  // Lowest complexity for CPU processing
              });
              await pose.initialize();
              usedCPUFallback = true;
              console.log('Successfully initialized MediaPipe in CPU-only mode');
            } catch (fallbackError) {
              // If even CPU fallback fails, provide comprehensive error message
              const isCompleteWebGLFailure = initializationError.message.includes('FEATURE_FAILURE_EGL_NO_CONFIG') ||
                                           initializationError.message.includes('FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS') ||
                                           initializationError.message.includes('Exhausted GL driver');
              
              if (isCompleteWebGLFailure) {
                throw new Error(`WebGL is not available in your browser or system. This is required for AI pose detection.

Possible solutions:
1. Update your graphics drivers
2. Enable hardware acceleration in browser settings
3. Try a different browser (Chrome/Edge recommended)
4. Check if WebGL is enabled: https://get.webgl.org/

Technical details: ${initializationError.message}`);
              } else {
                throw new Error(`MediaPipe initialization failed. Please try using Chrome or Edge for better compatibility. 

Original error: ${initializationError.message}
Fallback error: ${fallbackError.message}`);
              }
            }
          } else {
            throw initializationError;
          }
        }

        pose.onResults((results) => {
          // During warmup we only prime the GPU/model; don't show or analyze.
          if (warmingUpRef.current) return;
          // Draw immediately on the same canvas (frame + skeleton) for zero lag.
          if (drawRef.current) {
            drawRef.current(results);
          }
          // Update state for angle analysis (decoupled from drawing).
          if (results.poseLandmarks) {
            setLandmarks(results.poseLandmarks);
          }
        });

        // Logging removed to prevent double messages in React Strict Mode
        
        setIsLoaded(true);
        poseRef.current = pose;
      } catch (err) {
        let errorMessage = `Failed to initialize pose detection: ${err.message}`;
        
        // Add Firefox-specific guidance
        if (navigator.userAgent.toLowerCase().includes('firefox')) {
          errorMessage += '\n\nFirefox Compatibility Note: For the best experience with pose detection, consider using Chrome or Edge browsers. Firefox may have limited WebGL support that affects AI model performance.';
        }
        
        setError(errorMessage);
      }
    };

    loadMediaPipe();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (poseRef.current) {
        poseRef.current.close();
      }
    };
  }, []);

  const processFrame = useCallback(async (videoElement) => {
    if (!poseRef.current || !isLoaded || !videoElement) {
      return;
    }

    try {
      await poseRef.current.send({ image: videoElement });
    } catch (err) {
      setError(`Error processing frame: ${err.message}`);
    }
  }, [isLoaded]);

  const startContinuousDetection = useCallback((videoElement) => {
    if (!videoElement || !isLoaded) return;

    setIsProcessing(true);
    const detectFrame = async () => {
      if (videoElement.paused || videoElement.ended) {
        setIsProcessing(false);
        return;
      }

      // Process every frame - no FPS throttling
      await processFrame(videoElement);
      animationFrameRef.current = requestAnimationFrame(detectFrame);
    };

    detectFrame();
  }, [isLoaded, processFrame]);

  const stopContinuousDetection = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsProcessing(false);
  }, []);

  // Warm up the model on a static frame so the first inferences (GPU shader
  // compilation / model JIT) happen before playback. This avoids the
  // "starts slow then speeds up" effect once playback begins.
  const warmup = useCallback(async (videoElement, frames = 3) => {
    if (!poseRef.current || !isLoaded || !videoElement) return;
    warmingUpRef.current = true;
    try {
      for (let i = 0; i < frames; i++) {
        await poseRef.current.send({ image: videoElement });
      }
    } catch (err) {
      // Ignore warmup errors
    } finally {
      warmingUpRef.current = false;
    }
  }, [isLoaded]);

  const reset = useCallback(() => {
    setLandmarks(null);
    setError(null);
    stopContinuousDetection();
  }, [stopContinuousDetection]);

  return {
    isLoaded,
    isProcessing,
    landmarks,
    error,
    processFrame,
    startContinuousDetection,
    stopContinuousDetection,
    warmup,
    reset
  };
};
