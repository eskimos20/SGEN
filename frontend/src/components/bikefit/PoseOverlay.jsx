import { useEffect, useRef } from 'react';

// Drawing utils and connections will be loaded from window object
const drawConnectors = (ctx, landmarks, connections, options) => {
  if (window.drawConnectors) {
    window.drawConnectors(ctx, landmarks, connections, options);
  } else {
    // Fallback: draw connections manually
    connections.forEach(([start, end]) => {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];
      if (startPoint && endPoint) {
        ctx.beginPath();
        ctx.moveTo(startPoint.x * ctx.canvas.width, startPoint.y * ctx.canvas.height);
        ctx.lineTo(endPoint.x * ctx.canvas.width, endPoint.y * ctx.canvas.height);
        ctx.strokeStyle = options.color || '#00FF00';
        ctx.lineWidth = options.lineWidth || 2;
        ctx.stroke();
      }
    });
  }
};

const drawLandmarks = (ctx, landmarks, options) => {
  if (window.drawLandmarks) {
    window.drawLandmarks(ctx, landmarks, options);
  } else {
    // Fallback: draw landmarks manually
    landmarks.forEach((landmark) => {
      if (landmark) {
        ctx.beginPath();
        ctx.arc(
          landmark.x * ctx.canvas.width,
          landmark.y * ctx.canvas.height,
          options.radius || 5,
          0,
          2 * Math.PI
        );
        ctx.fillStyle = options.color || '#FF0000';
        ctx.fill();
      }
    });
  }
};

// MediaPipe Pose connections
const POSE_CONNECTIONS = window.POSE_CONNECTIONS || [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
];

const PoseOverlay = ({ canvasRef, landmarks, videoWidth, videoHeight, detectedSide = null }) => {
  const animationRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !landmarks) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size to match video
    if (videoWidth && videoHeight) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }

    // Clear canvas completely - use both methods to ensure clean slate
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Reset canvas state
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // Filter connections to only show detected side
    // Left side landmarks: 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31
    // Right side landmarks: 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32
    const leftLandmarks = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
    const rightLandmarks = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
    
    const sideConnections = POSE_CONNECTIONS.filter(([start, end]) => {
      if (detectedSide === 'left') {
        // Only show connections where BOTH points are on left side
        return leftLandmarks.includes(start) && leftLandmarks.includes(end);
      } else if (detectedSide === 'right') {
        // Only show connections where BOTH points are on right side
        return rightLandmarks.includes(start) && rightLandmarks.includes(end);
      }
      return true; // Show all if no side detected
    });

    // Draw pose connections (skeleton lines) - only for detected side
    drawConnectors(ctx, landmarks, sideConnections, {
      color: '#00FF00',
      lineWidth: 4
    });

    // Draw only landmarks for detected side
    const sideLandmarks = detectedSide === 'left' ? 
      [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31] :
      detectedSide === 'right' ?
      [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32] :
      [];

    sideLandmarks.forEach(index => {
      const landmark = landmarks[index];
      if (landmark) {
        ctx.beginPath();
        ctx.arc(
          landmark.x * canvas.width,
          landmark.y * canvas.height,
          6,
          0,
          2 * Math.PI
        );
        ctx.fillStyle = '#FF0000';
        ctx.fill();
      }
    });

    // Highlight key bike fit points - only for detected side
    const keyPoints = detectedSide === 'left' ? [
      { index: 11, label: 'Shoulder', color: '#FFD700' },
      { index: 23, label: 'Hip', color: '#FF6B6B' },
      { index: 25, label: 'Knee', color: '#4ECDC4' },
      { index: 27, label: 'Ankle', color: '#95E1D3' },
      { index: 13, label: 'Elbow', color: '#FFA07A' },
      { index: 15, label: 'Wrist', color: '#98D8C8' }
    ] : detectedSide === 'right' ? [
      { index: 12, label: 'Shoulder', color: '#FFD700' },
      { index: 24, label: 'Hip', color: '#FF6B6B' },
      { index: 26, label: 'Knee', color: '#4ECDC4' },
      { index: 28, label: 'Ankle', color: '#95E1D3' },
      { index: 14, label: 'Elbow', color: '#FFA07A' },
      { index: 16, label: 'Wrist', color: '#98D8C8' }
    ] : [];

    keyPoints.forEach(({ index, label, color }) => {
      const landmark = landmarks[index];
      if (!landmark) return;

      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;

      // Draw larger circle for key points
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw label
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(label, x + 12, y - 8);
      ctx.fillText(label, x + 12, y - 8);
    });

    // Restore canvas state
    ctx.restore();

  }, [landmarks, canvasRef, videoWidth, videoHeight, detectedSide]);

  return null;
};

export default PoseOverlay;
