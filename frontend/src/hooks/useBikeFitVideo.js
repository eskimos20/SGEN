import { useState, useRef } from 'react';

export const useBikeFitVideo = () => {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [fps, setFps] = useState(null);
  const [videoMetadata, setVideoMetadata] = useState(null);
  
  const videoRef = useRef(null);

  const loadVideo = (url, expectedFps, expectedDuration) => {
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;

      // The browser cannot reliably extract the real fps from a blob/file.
      // If the caller already knows it (e.g. from a recording), use that value.
      const fallbackDuration =
        Number.isFinite(expectedDuration) && expectedDuration > 0 ? expectedDuration : null;
      const finiteDuration = Number.isFinite(duration) ? duration : fallbackDuration;
      const actualFps =
        Number.isFinite(expectedFps) && expectedFps > 0 ? expectedFps : null;

      setFps(actualFps);
      setTotalFrames(finiteDuration && actualFps ? Math.floor(finiteDuration * actualFps) : null);
      setCurrentFrame(0);

      setVideoMetadata({
        resolution: width > 0 && height > 0 ? `${width} × ${height}` : 'Unknown',
        fps: actualFps ? actualFps.toString() : 'Unknown',
        duration: finiteDuration ? `${finiteDuration.toFixed(2)}s` : 'Unknown',
        totalFrames: finiteDuration && actualFps ? Math.floor(finiteDuration * actualFps).toString() : 'Unknown'
      });
    };
  };

  const handleFileUpload = (file, onComplete) => {
    if (file) {
      setVideoFile(file);
      const isCapacitorEnv = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
      if (isCapacitorEnv) {
        // Capacitor: use FileReader data URL for native compatibility
        const reader = new FileReader();
        reader.onload = (e) => {
          const url = e.target.result;
          setVideoUrl(url);
          loadVideo(url);
          if (onComplete) onComplete();
        };
        reader.readAsDataURL(file);
      } else {
        const url = URL.createObjectURL(file);
        setVideoUrl(url);
        loadVideo(url);
        if (onComplete) onComplete();
      }
    }
  };

  const seekToFrame = (frameNumber) => {
    if (!videoRef.current || !fps) return;
    const time = frameNumber / fps;
    videoRef.current.currentTime = time;
    setCurrentFrame(frameNumber);
  };

  const nextFrame = () => {
    if (typeof totalFrames === 'number' && currentFrame < totalFrames - 1) {
      seekToFrame(currentFrame + 1);
    }
  };

  const prevFrame = () => {
    if (currentFrame > 0) {
      seekToFrame(currentFrame - 1);
    }
  };

  const resetVideo = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoFile(null);
    setVideoUrl(null);
    setCurrentFrame(0);
    setTotalFrames(0);
    setFps(null);
    setVideoMetadata(null);
  };

  return {
    videoFile,
    videoUrl,
    currentFrame,
    totalFrames,
    fps,
    videoMetadata,
    videoRef,
    handleFileUpload,
    seekToFrame,
    nextFrame,
    prevFrame,
    resetVideo,
    loadVideo,
    setVideoUrl
  };
};
