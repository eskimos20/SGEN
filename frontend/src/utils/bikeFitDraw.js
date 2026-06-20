// Pose drawing for BikeFit. Draws the exact processed video frame (results.image)
// together with the skeleton on the SAME canvas, so image and overlay are always
// perfectly in sync regardless of inference latency (no overlay lag).

const POSE_CONNECTIONS = (typeof window !== 'undefined' && window.POSE_CONNECTIONS) || [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
];

const LEFT_LANDMARKS = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
const RIGHT_LANDMARKS = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];

const KEY_POINTS = {
  left: [
    { index: 11, label: 'Shoulder', color: '#FFD700' },
    { index: 23, label: 'Hip', color: '#FF6B6B' },
    { index: 25, label: 'Knee', color: '#4ECDC4' },
    { index: 27, label: 'Ankle', color: '#95E1D3' },
    { index: 13, label: 'Elbow', color: '#FFA07A' },
    { index: 15, label: 'Wrist', color: '#98D8C8' }
  ],
  right: [
    { index: 12, label: 'Shoulder', color: '#FFD700' },
    { index: 24, label: 'Hip', color: '#FF6B6B' },
    { index: 26, label: 'Knee', color: '#4ECDC4' },
    { index: 28, label: 'Ankle', color: '#95E1D3' },
    { index: 14, label: 'Elbow', color: '#FFA07A' },
    { index: 16, label: 'Wrist', color: '#98D8C8' }
  ]
};

/**
 * Draw the processed frame + pose skeleton on a single canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {object} results - MediaPipe Pose results ({ image, poseLandmarks })
 * @param {('left'|'right'|null)} detectedSide
 */
export function drawPose(canvas, results, detectedSide = null) {
  if (!canvas || !results) return;

  const ctx = canvas.getContext('2d');
  const image = results.image;
  const landmarks = results.poseLandmarks;

  // Match canvas pixel size to the source frame for crisp drawing.
  const w = (image && image.width) || canvas.width;
  const h = (image && image.height) || canvas.height;
  if (w && canvas.width !== w) canvas.width = w;
  if (h && canvas.height !== h) canvas.height = h;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw the exact frame the landmarks were computed from.
  if (image) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  if (!landmarks) {
    ctx.restore();
    return;
  }

  const sideList = detectedSide === 'left'
    ? LEFT_LANDMARKS
    : detectedSide === 'right'
      ? RIGHT_LANDMARKS
      : null;

  const connections = POSE_CONNECTIONS.filter(([start, end]) => {
    if (!sideList) return true;
    return sideList.includes(start) && sideList.includes(end);
  });

  // Skeleton lines
  ctx.strokeStyle = '#00FF00';
  ctx.lineWidth = 4;
  connections.forEach(([start, end]) => {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  });

  // Plain joints for the detected side
  if (sideList) {
    ctx.fillStyle = '#FF0000';
    sideList.forEach((index) => {
      const lm = landmarks[index];
      if (!lm) return;
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 6, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  // Highlighted key bike-fit points with labels
  const keyPoints = detectedSide ? KEY_POINTS[detectedSide] : [];
  keyPoints.forEach(({ index, label, color }) => {
    const lm = landmarks[index];
    if (!lm) return;
    const x = lm.x * canvas.width;
    const y = lm.y * canvas.height;

    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 12px Arial';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(label, x + 12, y - 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, x + 12, y - 8);
  });

  ctx.restore();
}

export { LEFT_LANDMARKS, RIGHT_LANDMARKS };
