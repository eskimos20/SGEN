import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

const durationLabel = (secs) => {
  const labels = { 1: '1s', 5: '5s', 15: '15s', 30: '30s', 60: '1m', 120: '2m', 180: '3m', 240: '4m', 300: '5m', 480: '8m', 600: '10m', 720: '12m', 900: '15m', 1200: '20m', 1800: '30m', 2400: '40m', 3600: '60m' };
  return labels[secs] || `${Math.round(secs / 60)}m`;
};
const distanceLabel = (m) => {
  const labels = { 400: '400m', 1000: '1 km', 1609: '1 mi', 5000: '5 km', 10000: '10 km', 21097: 'Half marathon', 42195: 'Marathon' };
  return labels[m] || `${(m / 1000).toFixed(1)} km`;
};
const formatSecPerKm = (secKm) => {
  if (!secKm || secKm <= 0) return '-';
  const mm = Math.floor(secKm / 60);
  const ss = Math.round(secKm % 60).toString().padStart(2, '0');
  return `${mm}:${ss} /km`;
};

// Merged all-time curve: one continuous line per metric — best power
// per duration (left y, watts) and best pace per distance (right y,
// seconds/km reversed). All run types are merged into one pace line.
const BestAllTimeCurveChart = ({ powerRecords, paceRecords }) => {
  const recordsChart = (() => {
    const durations = new Set((powerRecords || []).map(r => r.durationS));
    const distances = new Set((paceRecords || []).map(r => r.distanceM));
    const xs = [...new Set([...durations, ...distances])].sort((a, b) => a - b);
    const data = xs.map(x => {
      const point = { x, xLabel: distances.has(x) ? distanceLabel(x) : durationLabel(x) };
      const power = (powerRecords || []).find(r => r.durationS === x);
      if (power) point.watts = power.watts;
      const pace = (paceRecords || []).find(r => r.distanceM === x);
      if (pace) point.secKm = 1000 / pace.paceMps;
      return point;
    });
    let wattsMax = 0, secKmMax = 0;
    data.forEach(p => {
      if (p.watts > wattsMax) wattsMax = p.watts;
      if (p.secKm > secKmMax) secKmMax = p.secKm;
    });
    return {
      data,
      wattsMax: Math.ceil(wattsMax / 50) * 50 + 20,
      secKmMax: Math.ceil(secKmMax / 30) * 30 + 15
    };
  })();

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-600 flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-amber-600" />
        Best All Time Power/Pace Curve
      </h3>
      <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={recordsChart.data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="x"
                scale="log"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => recordsChart.data.find(p => p.x === v)?.xLabel || v}
                type="number"
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
              />
              <YAxis
                yAxisId="watts"
                domain={[0, recordsChart.wattsMax]}
                tickFormatter={(v) => `${v}W`}
                stroke="#f97316"
                fontSize={10}
                tickLine={false}
                width={45}
              />
              <YAxis
                yAxisId="pace"
                orientation="right"
                reversed
                domain={[0, recordsChart.secKmMax]}
                tickFormatter={formatSecPerKm}
                stroke="#10b981"
                fontSize={10}
                tickLine={false}
                width={55}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
                        <div className="font-medium mb-1">{data.xLabel}</div>
                        {payload.filter(p => p.value != null).map((p, idx) => {
                          const isPace = p.dataKey === 'secKm';
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                              <span style={{ color: p.color }}>
                                {isPace ? `Best Pace: ${formatSecPerKm(p.value)}` : `Best Power: ${Math.round(p.value)}W`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line
                yAxisId="watts"
                type="monotone"
                dataKey="watts"
                name="Best Power"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={true}
              />
              <Line
                yAxisId="pace"
                type="monotone"
                dataKey="secKm"
                name="Best Pace"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
    </div>
  );
};

export default React.memo(BestAllTimeCurveChart);
