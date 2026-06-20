import { useState, useRef, useEffect, useCallback } from 'react';

/* ================================
   DYNAMIC CAMERA CAPABILITY DETECTION
================================ */

/* ================================
   CODEC DETECTION
================================ */
const detectSupportedCodecs = () => {
  const codecs = [
    { name: 'VP9', mimeType: 'video/webm;codecs=vp9' },
    { name: 'VP8', mimeType: 'video/webm;codecs=vp8' },
    { name: 'H.264', mimeType: 'video/webm;codecs=h264' },
    { name: 'AV1', mimeType: 'video/webm;codecs=av01' }
  ];

  const supported = [];
  codecs.forEach(codec => {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(codec.mimeType)) {
      supported.push(codec);
    }
  });

  return supported;
};

/* ================================
   HELPERS
================================ */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const stopStream = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
};

const uniqueProfiles = (profiles) => {
  const map = new Map();

  profiles.forEach(p => {
    const key = `${p.width}x${p.height}@${p.fps}`;
    map.set(key, p);
  });

  return [...map.values()].sort((a, b) =>
    (b.width * b.height) - (a.width * a.height)
  );
};

/* ================================
   DETECTION CORE (capabilities-based)
================================ */
// Standard resolutions to offer when within the camera's reported range.
const STANDARD_RESOLUTIONS = [
  { w: 3840, h: 2160 }, // 4K UHD
  { w: 2560, h: 1440 }, // 1440p QHD
  { w: 1920, h: 1080 }, // 1080p Full HD
  { w: 1280, h: 720 },  // 720p HD
  { w: 640, h: 480 },   // VGA
  { w: 320, h: 240 }    // QVGA
];

// Derive supported profiles from a single getUserMedia call by reading
// track.getCapabilities(). This avoids re-opening the camera for every
// resolution/fps combination (which made the camera light blink and was slow).
const detectSupportedProfiles = async (deviceId) => {
  const profiles = [];
  let tempStream = null;

  try {
    tempStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });

    const track = tempStream.getVideoTracks()[0];

    let capabilities = {};
    try {
      capabilities = (track.getCapabilities && track.getCapabilities()) || {};
    } catch (err) {
      console.error('Failed to get camera capabilities:', err);
    }
    const settings = track.getSettings ? track.getSettings() : {};

    stopStream(tempStream);
    tempStream = null;

    const maxW = capabilities.width?.max || settings.width || 1280;
    const maxH = capabilities.height?.max || settings.height || 720;
    const minW = capabilities.width?.min || 0;
    const minH = capabilities.height?.min || 0;
    const maxFps = Math.floor(capabilities.frameRate?.max || settings.frameRate || 30);
    const minFps = Math.ceil(capabilities.frameRate?.min || 0);

    // Build the resolution list: native max + standard sizes within range.
    const resolutions = [{ w: maxW, h: maxH }];
    for (const res of STANDARD_RESOLUTIONS) {
      if (res.w <= maxW && res.h <= maxH && res.w >= minW && res.h >= minH) {
        resolutions.push(res);
      }
    }

    // Build the fps list within the supported range.
    const fpsValues = [];
    for (const fps of [120, 90, 60, 30, 24]) {
      if (fps <= maxFps && fps >= minFps) fpsValues.push(fps);
    }
    if (!fpsValues.includes(maxFps) && maxFps > 0) fpsValues.push(maxFps);
    if (fpsValues.length === 0) fpsValues.push(maxFps || 30);

    for (const res of resolutions) {
      for (const fps of fpsValues) {
        profiles.push({ width: res.w, height: res.h, fps });
      }
    }
  } catch (err) {
    console.error('Failed to get camera capabilities:', err);
  } finally {
    if (tempStream) stopStream(tempStream);
  }

  return uniqueProfiles(profiles);
};

/* ================================
   HOOK
================================ */
export const useBikeFitRecording = (videoRef, onRecordingComplete) => {
  const [stream, setStream] = useState(null);

  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');

  const [supportedProfiles, setSupportedProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  
  const [supportedCodecs, setSupportedCodecs] = useState([]);

  const [isRecording, setIsRecording] = useState(false);

  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(30);
  const [startDelay, setStartDelay] = useState(5);
  const [countdown, setCountdown] = useState(0);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const profileCacheRef = useRef({});
  const detectingRef = useRef(false);
  const initRef = useRef(false);

  /* ================================
     INIT (lazy - only on demand)
  ================================= */
  // Only clean up on unmount. The camera is NOT touched until initCamera() is
  // called (e.g. when the Record tab is opened), so the camera light does not
  // turn on for users who only upload/analyze videos.
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const initCamera = useCallback(async () => {
    if (initRef.current) return;
    initRef.current = true;
    try {
      // Detect supported codecs
      const codecs = detectSupportedCodecs();
      setSupportedCodecs(codecs);

      await checkCameras();
    } catch (err) {
      initRef.current = false; // allow retry on failure
      console.error(err);
    }
  }, []);

  /* ================================
     CAMERA LIST
  ================================= */
  const checkCameras = async () => {
    try {
      // First enumerate without permission to see device count
      const devicesBeforePerm = await navigator.mediaDevices.enumerateDevices();
      const camsBeforePerm = devicesBeforePerm.filter(d => d.kind === 'videoinput');
      
      // Request permission - this is crucial for getting all cameras
      // Chrome on macOS sometimes needs multiple permission requests to see all cameras
      const permStream = await navigator.mediaDevices.getUserMedia({ 
        video: true 
      });
      stopStream(permStream);
      
      // Small delay to ensure permission is fully granted
      await sleep(200);

      // Now enumerate again with permission
      let devices = await navigator.mediaDevices.enumerateDevices();
      let cams = devices.filter(d => d.kind === 'videoinput');

      // Chrome on macOS workaround: If we only found 1 camera, try multiple strategies
      if (cams.length === 1) {
        // Strategy 1: Try facingMode 'user' for built-in camera
        try {
          const userStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' } 
          });
          stopStream(userStream);
          await sleep(200);
          
          devices = await navigator.mediaDevices.enumerateDevices();
          cams = devices.filter(d => d.kind === 'videoinput');
        } catch (err) {
          // facingMode user failed
        }
        
        // Strategy 2: Try facingMode 'environment' for external camera
        if (cams.length === 1) {
          try {
            const envStream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: 'environment' } 
            });
            stopStream(envStream);
            await sleep(200);
            
            devices = await navigator.mediaDevices.enumerateDevices();
            cams = devices.filter(d => d.kind === 'videoinput');
          } catch (err) {
            // facingMode environment failed
          }
        }
        
        // Strategy 3: Request each deviceId we know about
        if (cams.length === 1) {
          const allDeviceIds = [...new Set(camsBeforePerm.map(d => d.deviceId))];
          
          for (const deviceId of allDeviceIds) {
            try {
              const idStream = await navigator.mediaDevices.getUserMedia({ 
                video: { deviceId: { exact: deviceId } } 
              });
              stopStream(idStream);
              await sleep(100);
            } catch (err) {
              // deviceId failed
            }
          }
          
          devices = await navigator.mediaDevices.enumerateDevices();
          cams = devices.filter(d => d.kind === 'videoinput');
        }
      }

      if (cams.length === 0) {
        console.error('No cameras found!');
        return;
      }

      setAvailableCameras(cams);

      if (!selectedCamera && cams.length > 0) {
        // Prefer 4K/BRIO cameras, then external cameras, then built-in
        const preferred = 
          cams.find(c => 
            c.label.toLowerCase().includes('brio') ||
            c.label.toLowerCase().includes('4k')
          ) ||
          cams.find(c => 
            c.label.toLowerCase().includes('usb') ||
            c.label.toLowerCase().includes('external')
          ) ||
          cams[0];
        
        setSelectedCamera(preferred.deviceId);
      }
    } catch (err) {
      console.error('Error checking cameras:', err);
      throw err;
    }
  };

  /* ================================
     PROFILE DETECTION (FIXED)
  ================================= */
  useEffect(() => {
    if (!selectedCamera) return;

    const run = async () => {
      if (detectingRef.current) return;
      detectingRef.current = true;

      try {
        if (profileCacheRef.current[selectedCamera]) {
          setSupportedProfiles(profileCacheRef.current[selectedCamera]);
          return;
        }

        const profiles = await detectSupportedProfiles(selectedCamera);

        profileCacheRef.current[selectedCamera] = profiles;

        setSupportedProfiles(profiles);

        if (profiles.length > 0) {
          setSelectedProfile(profiles[0]);
        }

      } finally {
        detectingRef.current = false;
      }
    };

    run();
  }, [selectedCamera]);

  /* ================================
     START CAMERA (RUNTIME MODE)
  ================================= */
  const startCamera = useCallback(async () => {
    stopCamera();

    const constraints = {
      video: {
        deviceId: selectedCamera ? { exact: selectedCamera } : undefined
      }
    };

    if (selectedProfile) {
      constraints.video.width = { ideal: selectedProfile.width };
      constraints.video.height = { ideal: selectedProfile.height };
      constraints.video.frameRate = { ideal: selectedProfile.fps };
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    const track = mediaStream.getVideoTracks()[0];
    const settings = track.getSettings();

    setStream(mediaStream);

    if (videoRef?.current) {
      videoRef.current.srcObject = mediaStream;
      await videoRef.current.play().catch(() => {});
    }
  }, [selectedCamera, selectedProfile]);

  /* ================================
     STOP CAMERA
  ================================= */
  const stopCamera = () => {
    if (stream) stopStream(stream);
    setStream(null);
  };

  /* ================================
     RECORDING
  ================================= */
  const startRecording = () => {
    if (!stream) return;

    setCountdown(startDelay);
    setRecordingTime(0);
    setIsRecording(true);

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          startActualRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startActualRecording = () => {
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
    });

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);

      stopCamera();

      setIsRecording(false);

      onRecordingComplete?.(url);
    };

    recorder.start(100);

    const start = Date.now();

    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000);
      setRecordingTime(sec);

      if (sec >= recordingDuration) {
        clearInterval(interval);
        recorder.stop();
      }
    }, 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  /* ================================
     UI HELPERS
  ================================= */
  // Only show resolutions that have at least one working FPS
  const resolutionMap = new Map();
  supportedProfiles.forEach(p => {
    const key = `${p.width}x${p.height}`;
    if (!resolutionMap.has(key)) {
      resolutionMap.set(key, { width: p.width, height: p.height });
    }
  });
  
  const availableResolutions = Array.from(resolutionMap.values())
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))
    .map(r => ({
      value: `${r.width}x${r.height}`,
      label: `${r.width}×${r.height}`
    }));

  // Only show FPS values that actually work for the selected resolution
  const availableFpsValues = selectedProfile
    ? supportedProfiles
        .filter(p =>
          p.width === selectedProfile.width &&
          p.height === selectedProfile.height
        )
        .sort((a, b) => b.fps - a.fps)
        .map(p => ({
          value: p.fps,
          label: `${p.fps} fps`
        }))
    : [];

  /* ================================
     BACKWARD COMPATIBILITY
  ================================= */
  const selectedResolution = selectedProfile 
    ? `${selectedProfile.width}x${selectedProfile.height}`
    : '';
    
  const selectedFps = selectedProfile 
    ? selectedProfile.fps.toString()
    : '';
    
  const setSelectedResolution = (resolutionStr) => {
    if (!resolutionStr) return;
    const [width, height] = resolutionStr.split('x').map(Number);
    const profile = supportedProfiles.find(p => p.width === width && p.height === height);
    if (profile) {
      setSelectedProfile(profile);
    }
  };
  
  const setSelectedFps = (fpsStr) => {
    if (!fpsStr || !selectedProfile) return;
    const fps = parseInt(fpsStr);
    const profile = supportedProfiles.find(p => 
      p.width === selectedProfile.width && 
      p.height === selectedProfile.height && 
      p.fps === fps
    );
    if (profile) {
      setSelectedProfile(profile);
    }
  };
  
  const cameraCapabilities = selectedProfile ? {
    resolution: `${selectedProfile.width}x${selectedProfile.height}`,
    fps: selectedProfile.fps,
    maxResolution: supportedProfiles.length > 0 
      ? `${supportedProfiles[0].width}x${supportedProfiles[0].height}`
      : 'Unknown',
    maxFps: supportedProfiles.length > 0 
      ? supportedProfiles[0].fps
      : 'Unknown'
  } : null;

  /* ================================
     RETURN
  ================================= */
  return {
    stream,

    availableCameras,
    selectedCamera,
    setSelectedCamera,

    supportedProfiles,
    selectedProfile,
    setSelectedProfile,
    
    // Backward compatibility
    selectedResolution,
    setSelectedResolution,
    selectedFps,
    setSelectedFps,
    cameraCapabilities,
    supportedCodecs,

    initCamera,
    startCamera,
    stopCamera,

    startRecording,
    stopRecording,

    isRecording,
    recordingTime,
    recordingDuration,
    setRecordingDuration,

    countdown,
    startDelay,
    setStartDelay,

    availableResolutions,
    availableFpsValues
  };
};