import { Gauge, Zap, TrendingUp, Target } from 'lucide-react';
import { flattenSteps } from '../../utils/workoutUtils';

const WorkoutStats = ({ workoutDoc, ftp }) => {
  // Hide watt-based stats if no FTP is configured for the sport
  if (!ftp || !workoutDoc?.steps) return null;

  const steps = flattenSteps(workoutDoc.steps);
  
  // Calculate workout metrics with correct power sampling
  let totalDuration = 0;
  let totalPowerSeconds = 0;
  const powerSamples = [];

  // Calculate power for each second
  // Pace workouts store the percentage in `step.pace` instead of `step.power`.
  for (const step of steps) {
    const duration = step.duration || 0;
    totalDuration += duration;

    const powerTarget = step.power || step.pace;
    if (powerTarget?.start !== undefined && powerTarget?.end !== undefined) {
      // Ramp - interpolate power from start to end
      const startPower = (powerTarget.start / 100) * ftp;
      const endPower = (powerTarget.end / 100) * ftp;
      for (let i = 0; i < duration; i++) {
        const progress = i / duration;
        const power = startPower + (endPower - startPower) * progress;
        powerSamples.push(power);
        totalPowerSeconds += power;
      }
    } else if (powerTarget?.value !== undefined) {
      // Steady state
      const power = (powerTarget.value / 100) * ftp;
      for (let i = 0; i < duration; i++) {
        powerSamples.push(power);
        totalPowerSeconds += power;
      }
    }
  }

  // Average Power
  const avgPower = totalDuration > 0 ? totalPowerSeconds / totalDuration : 0;

  // Normalized Power (NP) - rolling 30s average raised to 4th power
  let normalizedPower = avgPower; // Fallback to average
  if (powerSamples.length >= 30) {
    const rollingAvgs = [];
    for (let i = 0; i <= powerSamples.length - 30; i++) {
      const window = powerSamples.slice(i, i + 30);
      const avg = window.reduce((sum, p) => sum + p, 0) / 30;
      rollingAvgs.push(Math.pow(avg, 4));
    }
    const avgFourthPower = rollingAvgs.reduce((sum, p) => sum + p, 0) / rollingAvgs.length;
    normalizedPower = Math.pow(avgFourthPower, 0.25);
  }

  // Variability Index
  const variability = avgPower > 0 ? normalizedPower / avgPower : 1;

  // Energy (kJ)
  const workKj = (avgPower * totalDuration) / 1000;

  const intensity = ftp > 0 ? (normalizedPower / ftp) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-white rounded-lg p-3 text-center shadow-sm">
        <Gauge className="h-5 w-5 text-purple-600 mx-auto mb-1" />
        <div className="text-lg font-bold text-gray-900">{Math.round(normalizedPower)}W</div>
        <div className="text-xs text-gray-500">Normalized</div>
      </div>
      <div className="bg-white rounded-lg p-3 text-center shadow-sm">
        <Gauge className="h-5 w-5 text-blue-600 mx-auto mb-1" />
        <div className="text-lg font-bold text-gray-900">{Math.round(avgPower)}W</div>
        <div className="text-xs text-gray-500">Average</div>
      </div>
      <div className="bg-white rounded-lg p-3 text-center shadow-sm">
        <TrendingUp className="h-5 w-5 text-indigo-600 mx-auto mb-1" />
        <div className="text-lg font-bold text-gray-900">{variability.toFixed(2)}</div>
        <div className="text-xs text-gray-500">Variability</div>
      </div>
      <div className="bg-white rounded-lg p-3 text-center shadow-sm">
        <Zap className="h-5 w-5 text-amber-600 mx-auto mb-1" />
        <div className="text-lg font-bold text-gray-900">{Math.round(workKj)} kJ</div>
        <div className="text-xs text-gray-500">Work</div>
      </div>
    </div>
  );
};

export default WorkoutStats;
