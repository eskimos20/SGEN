import { useState, useRef } from 'react';

export const useBikeFitVideo = () => {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [fps, setFps] = useState(null);
  const [videoMetadata, setVideoMetadata] = useState(null);
  
  const videoRef = useRef(null);

  const loadVideo = (url) => {
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      const estimatedFps = 30;
      
      setFps(estimatedFps);
      setTotalFrames(Math.floor(duration * estimatedFps));
      setCurrentFrame(0);
      
      setVideoMetadata({
        resolution: `${width} × ${height}`,
        fps: estimatedFps,
        duration: `${duration.toFixed(2)}s`,
        totalFrames: Math.floor(duration * estimatedFps)
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
    if (!videoRef.current) return;
    const time = frameNumber / fps;
    videoRef.current.currentTime = time;
    setCurrentFrame(frameNumber);
  };

  const nextFrame = () => {
    if (currentFrame < totalFrames - 1) {
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
