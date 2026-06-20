import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * BikeFit angle analysis.
 *
 * Methodology (side-view video):
 * - Landmarks are converted to an isotropic metric space (x scaled by the video
 *   aspect ratio) before any angle is computed, so angles are geometrically
 *   correct regardless of whether the video is square or 16:9.
 * - The side closest to the camera is locked in after a short visibility vote
 *   so the skeleton/source side never flickers.
 * - Per-frame joint angles are collected into sample buffers and aggregated with
 *   robust percentiles/median instead of a plain mean, so a few bad detections
 *   don't skew the result:
 *     - Knee extension (BDC)  = 95th percentile of the knee angle (max extension)
 *     - Knee flexion  (TDC)   = 5th  percentile of the knee angle (max flexion)
 *     - Hip (closed)          = 5th  percentile of the hip angle (most closed, ~TDC)
 *     - Ankle / Back / Elbow  = median (these are stable over the pedal stroke)
 * - Back angle is measured from the horizontal (0deg = flat/aero, 90deg = upright).
 */

// MediaPipe `visibility` required for a landmark to be used (0..1).
const MIN_CONFIDENCE = 0.5;
// Frames used to vote which side faces the camera before locking it in.
const SIDE_VOTE_FRAMES = 20;
// Minimum samples before a metric is reported (avoids noisy early values).
const MIN_KNEE_SAMPLES = 20;
const MIN_SAMPLES = 12;

// MediaPipe Pose landmark indices per side.
const SIDE_LANDMARKS = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, foot: 31 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, foot: 32 }
};

const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

// Robust percentile (linear interpolation). arr must be non-empty.
const percentile = (arr, p) => {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

const median = (arr) => percentile(arr, 50);

// Interior angle (degrees) at vertex `b` formed by points a-b-c, in metric space.
const angleAt = (a, b, c) => {
  if (!a || !b || !c) return null;
  const v1x = a.X - b.X;
  const v1y = a.Y - b.Y;
  const v2x = c.X - b.X;
  const v2y = c.Y - b.Y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return null;
  let cos = (v1x * v2x + v1y * v2y) / (m1 * m2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
};

const emptyAngles = () => ({
  kneeBDC: null,
  kneeTDC: null,
  hip: null,
  ankle: null,
  back: null,
  elbow: null
});

const emptySamples = () => ({ knee: [], hip: [], ankle: [], back: [], elbow: [] });

export const useBikeFitAnalysis = (landmarks, videoSize) => {
  const [angles, setAngles] = useState(emptyAngles());
  const [detectedSide, setDetectedSide] = useState(null);

  const samplesRef = useRef(emptySamples());
  const sideVoteRef = useRef({ left: 0, right: 0, frames: 0, locked: null });

  const hasConf = useCallback(
    (lm) => lm && (lm.visibility === undefined || lm.visibility >= MIN_CONFIDENCE),
    []
  );

  useEffect(() => {
    if (!landmarks || landmarks.length < 33) return;

    // Convert to isotropic metric space: scale x by aspect ratio so a unit in x
    // and a unit in y represent the same physical distance.
    const w = videoSize?.width || 0;
    const h = videoSize?.height || 0;
    const aspect = w > 0 && h > 0 ? w / h : 1;
    const toMetric = (lm) =>
      lm ? { X: lm.x * aspect, Y: lm.y, visibility: lm.visibility } : null;

    const vote = sideVoteRef.current;

    // ---- Lock the camera-facing side via a short visibility vote ----
    if (!vote.locked) {
      const leftVis =
        (landmarks[11]?.visibility || 0) +
        (landmarks[23]?.visibility || 0) +
        (landmarks[25]?.visibility || 0) +
        (landmarks[27]?.visibility || 0);
      const rightVis =
        (landmarks[12]?.visibility || 0) +
        (landmarks[24]?.visibility || 0) +
        (landmarks[26]?.visibility || 0) +
        (landmarks[28]?.visibility || 0);
      vote.left += leftVis;
      vote.right += rightVis;
      vote.frames += 1;

      const provisional = vote.left >= vote.right ? 'left' : 'right';
      setDetectedSide(provisional);

      if (vote.frames >= SIDE_VOTE_FRAMES) {
        vote.locked = provisional;
      } else {
        // Keep voting; don't collect samples until the side is locked.
        return;
      }
    }

    const side = vote.locked;
    setDetectedSide(side);
    const ids = SIDE_LANDMARKS[side];

    const shoulder = toMetric(landmarks[ids.shoulder]);
    const elbow = toMetric(landmarks[ids.elbow]);
    const wrist = toMetric(landmarks[ids.wrist]);
    const hip = toMetric(landmarks[ids.hip]);
    const knee = toMetric(landmarks[ids.knee]);
    const ankle = toMetric(landmarks[ids.ankle]);
    const heel = toMetric(landmarks[ids.heel]);
    const foot = toMetric(landmarks[ids.foot]);

    const samples = samplesRef.current;

    // ---- Leg/hip require shoulder, hip, knee, ankle with good confidence ----
    if (hasConf(shoulder) && hasConf(hip) && hasConf(knee) && hasConf(ankle)) {
      const kneeAngle = angleAt(hip, knee, ankle);
      if (kneeAngle !== null) samples.knee.push(kneeAngle);

      // Hip flexion = interior angle torso(hip->shoulder) vs thigh(hip->knee).
      const hipAngle = angleAt(shoulder, hip, knee);
      if (hipAngle !== null) samples.hip.push(hipAngle);

      // Back angle from the horizontal (0deg flat, 90deg upright).
      const dx = shoulder.X - hip.X;
      const dy = shoulder.Y - hip.Y;
      const backAngle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
      samples.back.push(backAngle);

      // Ankle angle: prefer toe (foot index); fall back to heel.
      let ankleAngle = null;
      if (hasConf(foot)) ankleAngle = angleAt(knee, ankle, foot);
      else if (hasConf(heel)) ankleAngle = angleAt(knee, ankle, heel);
      if (ankleAngle !== null) samples.ankle.push(ankleAngle);
    }

    // ---- Elbow requires shoulder, elbow, wrist ----
    if (hasConf(shoulder) && hasConf(elbow) && hasConf(wrist)) {
      const elbowAngle = angleAt(shoulder, elbow, wrist);
      if (elbowAngle !== null) samples.elbow.push(elbowAngle);
    }

    // ---- Aggregate robustly ----
    const next = emptyAngles();
    if (samples.knee.length >= MIN_KNEE_SAMPLES) {
      next.kneeBDC = round1(percentile(samples.knee, 95)); // max extension
      next.kneeTDC = round1(percentile(samples.knee, 5)); // max flexion
    }
    if (samples.hip.length >= MIN_KNEE_SAMPLES) {
      next.hip = round1(percentile(samples.hip, 5)); // most closed (~TDC)
    }
    if (samples.ankle.length >= MIN_SAMPLES) next.ankle = round1(median(samples.ankle));
    if (samples.back.length >= MIN_SAMPLES) next.back = round1(median(samples.back));
    if (samples.elbow.length >= MIN_SAMPLES) next.elbow = round1(median(samples.elbow));

    setAngles(next);
  }, [landmarks, videoSize, hasConf]);

  const reset = useCallback(() => {
    setAngles(emptyAngles());
    setDetectedSide(null);
    samplesRef.current = emptySamples();
    sideVoteRef.current = { left: 0, right: 0, frames: 0, locked: null };
  }, []);

  return { angles, detectedSide, reset };
};
