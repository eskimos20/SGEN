import { useMemo } from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, ComposedChart, ReferenceArea } from 'recharts';
import { Activity, Heart, TrendingUp, Moon } from 'lucide-react';
import { format } from 'date-fns';
import { calculateAge } from '../../utils/athleteUtils';

// Age-based HRV (rMSSD) reference ranges in ms.
// Thresholds t = [poorMax, fairMax, goodMax, veryGoodMax]:
//   Poor < t0, Fair t0–t1, Good t1–t2, Very Good t2–t3, Excellent > t3
const HRV_AGE_RANGES = [
  { maxAge: 29, label: '20–30', t: [25, 45, 75, 110] },
  { maxAge: 39, label: '30–40', t: [20, 40, 65, 95] },
  { maxAge: 49, label: '40–50', t: [15, 30, 55, 80] },
  { maxAge: 59, label: '50–60', t: [13, 25, 48, 70] },
  { maxAge: 69, label: '60–70', t: [10, 20, 40, 60] },
  { maxAge: 200, label: '70+', t: [8, 18, 35, 50] },
];

const HRV_CATEGORIES = [
  { name: 'Poor', dot: 'bg-red-500', text: 'text-red-700' },
  { name: 'Fair', dot: 'bg-amber-500', text: 'text-amber-700' },
  { name: 'Good', dot: 'bg-lime-500', text: 'text-lime-700' },
  { name: 'Very Good', dot: 'bg-green-500', text: 'text-green-700' },
  { name: 'Excellent', dot: 'bg-emerald-600', text: 'text-emerald-700' },
];

const getHrvBracket = (age) => {
  if (age == null || isNaN(age)) return null;
  return HRV_AGE_RANGES.find(r => age <= r.maxAge) || HRV_AGE_RANGES[HRV_AGE_RANGES.length - 1];
};

const getHrvRangeLabels = (t) => [
  `< ${t[0]} ms`,
  `${t[0]}–${t[1]} ms`,
  `${t[1]}–${t[2]} ms`,
  `${t[2]}–${t[3]} ms`,
  `> ${t[3]} ms`,
];

const getHrvCategoryIndex = (value, t) => {
  if (value == null || isNaN(value)) return -1;
  if (value < t[0]) return 0;
  if (value < t[1]) return 1;
  if (value < t[2]) return 2;
  if (value < t[3]) return 3;
  return 4;
};

// Sleep Score (0–100) reference categories
const SLEEP_SCORE_CATEGORIES = [
  { name: 'Excellent', dot: 'bg-green-500', text: 'text-green-700', label: '90–100' },
  { name: 'Good', dot: 'bg-lime-500', text: 'text-lime-700', label: '80–89' },
  { name: 'Fair', dot: 'bg-amber-500', text: 'text-amber-700', label: '60–79' },
  { name: 'Poor', dot: 'bg-red-500', text: 'text-red-700', label: '< 60' },
];

const getSleepScoreIndex = (v) => {
  if (v == null || isNaN(v)) return -1;
  if (v >= 90) return 0;
  if (v >= 80) return 1;
  if (v >= 60) return 2;
  return 3;
};

const FitnessChart = ({ wellness = [], athleteProfile = null }) => {
  const fitnessData = useMemo(() => {
    if (!wellness || wellness.length === 0) return [];
    
    return wellness
      .filter(w => w.id && (w.ctl !== undefined || w.atl !== undefined))
      .map(w => ({
        date: w.id,
        dateFormatted: format(new Date(w.id), 'MMM d'),
        ctl: w.ctl || 0,
        atl: w.atl || 0,
        form: (w.ctl || 0) - (w.atl || 0),
        rampRate: w.rampRate || 0,
        hrv: w.hrv || null,
        hrvSDNN: w.hrvSDNN || null,
        restingHR: w.restingHR || null,
        sleepHours: w.sleepSecs ? w.sleepSecs / 3600 : null,
        sleepScore: w.sleepScore || null,
        weight: w.weight || null,
        readiness: w.readiness || null,
        // For colored form area
        formFresh: (w.ctl || 0) - (w.atl || 0) > 25 ? (w.ctl || 0) - (w.atl || 0) : null,
        formTransition: ((w.ctl || 0) - (w.atl || 0) >= 5 && (w.ctl || 0) - (w.atl || 0) <= 25) ? (w.ctl || 0) - (w.atl || 0) : null,
        formGrey: ((w.ctl || 0) - (w.atl || 0) >= -10 && (w.ctl || 0) - (w.atl || 0) < 5) ? (w.ctl || 0) - (w.atl || 0) : null,
        formOptimal: ((w.ctl || 0) - (w.atl || 0) >= -30 && (w.ctl || 0) - (w.atl || 0) < -10) ? (w.ctl || 0) - (w.atl || 0) : null,
        formHighRisk: (w.ctl || 0) - (w.atl || 0) < -30 ? (w.ctl || 0) - (w.atl || 0) : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [wellness]);

  // Calculate max sleep hours for dynamic scaling
  const maxSleepHours = useMemo(() => {
    const sleepValues = fitnessData
      .map(d => d.sleepHours)
      .filter(hours => hours !== null && hours !== undefined && !isNaN(hours));
    
    if (sleepValues.length === 0) return 12;
    
    const max = Math.max(...sleepValues);
    // Round up to nearest whole number or 0.5 hour increments
    const roundedMax = Math.ceil(max * 2) / 2;
    // Add 1 hour margin for better visibility
    return Math.max(12, roundedMax + 1);
  }, [fitnessData]);

  // Get today's fitness data
  // Use local date to match intervals.icu behavior
  const latestData = useMemo(() => {
    if (fitnessData.length === 0) return null;
    
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Find today's entry first
    const todayEntry = fitnessData.find(d => d.date === today);
    if (todayEntry) return todayEntry;
    
    // Fallback: get most recent entry up to today
    const todayOrPast = fitnessData.filter(d => d.date <= today);
    return todayOrPast.length > 0 ? todayOrPast[todayOrPast.length - 1] : fitnessData[fitnessData.length - 1];
  }, [fitnessData]);
  
  const getFormZone = (form) => {
    if (form === null || form === undefined) return { zone: 'Unknown', color: 'gray', description: 'No data' };
    if (form < -30) return { zone: 'High Risk', color: '#dc2626', description: 'Overreaching - high injury risk' };
    if (form < -10) return { zone: 'Optimal', color: '#f59e0b', description: 'Peak performance zone' };
    if (form < 5) return { zone: 'Grey Zone', color: '#9ca3af', description: 'Maintenance - neither fresh nor fatigued' };
    if (form < 25) return { zone: 'Transition', color: '#22c55e', description: 'Building fitness or recovering' };
    return { zone: 'Fresh', color: '#10b981', description: 'Well rested - ready for hard training' };
  };

  const hasHrvData = fitnessData.some(d => d.hrv !== null || d.hrvSDNN !== null);
  const hasSleepData = fitnessData.some(d => d.sleepHours !== null);

  // Athlete age for age-based HRV reference ranges
  const age = useMemo(() => {
    const dob = athleteProfile?.athlete?.icu_date_of_birth;
    return dob ? calculateAge(dob) : null;
  }, [athleteProfile]);

  // Average HRV (rMSSD) over the visible period, used to highlight the user's category
  const avgHrv = useMemo(() => {
    const values = fitnessData
      .map(d => d.hrv)
      .filter(v => v !== null && v !== undefined && !isNaN(v));
    if (values.length === 0) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }, [fitnessData]);

  const ageKnown = age != null && !isNaN(age);
  // Fall back to the 40–50 bracket when the athlete's age is not set
  const HRV_DEFAULT_BRACKET = HRV_AGE_RANGES.find(r => r.label === '40–50');
  const hrvBracket = ageKnown ? getHrvBracket(age) : HRV_DEFAULT_BRACKET;
  const hrvActiveIndex = hrvBracket ? getHrvCategoryIndex(avgHrv, hrvBracket.t) : -1;

  // Average sleep score over the visible period
  const avgSleepScore = useMemo(() => {
    const values = fitnessData
      .map(d => d.sleepScore)
      .filter(v => v !== null && v !== undefined && !isNaN(v));
    if (values.length === 0) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }, [fitnessData]);

  const sleepScoreActiveIndex = getSleepScoreIndex(avgSleepScore);

  if (fitnessData.length === 0) {
    return (
      <div className="card-mobile">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          Fitness & Form
        </h2>
        <div className="text-center py-8 text-gray-500">
          No fitness data available for the selected period
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with current values - intervals.icu style */}
      {latestData && (
        <div className="card-mobile">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{latestData.dateFormatted}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Fitness</span>
              <span className="font-bold text-blue-600">{Math.round(latestData.ctl)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Fatigue</span>
              <span className="font-bold text-purple-600">{Math.round(latestData.atl)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Form</span>
              {/* Calculate form as difference of rounded values to match intervals.icu */}
              {(() => {
                const roundedCtl = Math.round(latestData.ctl);
                const roundedAtl = Math.round(latestData.atl);
                const roundedForm = roundedCtl - roundedAtl;
                const zone = roundedForm < -30 ? 'High Risk' :
                  roundedForm < -10 ? 'Optimal' :
                  roundedForm < 5 ? 'Grey Zone' :
                  roundedForm < 25 ? 'Transition' : 'Fresh';
                const zoneColors = roundedForm < -30 ? 'bg-red-100 text-red-700' :
                  roundedForm < -10 ? 'bg-amber-100 text-amber-700' :
                  roundedForm < 5 ? 'bg-gray-100 text-gray-700' :
                  roundedForm < 25 ? 'bg-green-100 text-green-700' :
                  'bg-emerald-100 text-emerald-700';
                return (
                  <>
                    <span className={`font-bold ${
                      roundedForm < -30 ? 'text-red-600' :
                      roundedForm < -10 ? 'text-amber-600' :
                      roundedForm < 5 ? 'text-gray-600' :
                      'text-green-600'
                    }`}>
                      {roundedForm > 0 ? '+' : ''}{roundedForm}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${zoneColors}`}>
                      {zone}
                    </span>
                  </>
                );
              })()}
            </div>
            {latestData.hrv !== null && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600">HRV</span>
                <span className="font-bold text-pink-600">{Math.round(latestData.hrv)}</span>
              </div>
            )}
            {latestData.restingHR !== null && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600">RHR</span>
                <span className="font-bold text-red-500">{latestData.restingHR}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fitness & Fatigue Chart - Upper chart like intervals.icu */}
      <div className="card-mobile">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          CTL - ATL
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fitnessData} margin={{ top: 5, right: 5, left: -35, bottom: 5 }}>
              <defs>
                <linearGradient id="fitnessGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              
              <XAxis 
                dataKey="dateFormatted" 
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                axisLine={{ stroke: '#d1d5db' }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <YAxis 
                yAxisId="fitness"
                tick={{ fontSize: 10 }}
                domain={[0, 'auto']}
                axisLine={{ stroke: '#d1d5db' }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <YAxis 
                yAxisId="fitness"
                orientation="right"
                tick={{ fontSize: 10 }}
                domain={[0, 'auto']}
                axisLine={{ stroke: '#d1d5db' }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                formatter={(value, name) => [Math.round(value), name]}
                labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
              />

              {/* Fitness area fill (CTL) - light blue gradient like intervals.icu */}
              <Area 
                yAxisId="fitness"
                type="monotone" 
                dataKey="ctl" 
                stroke="none"
                fill="url(#fitnessGradient)"
                isAnimationActive={false}
                legendType="none"
                activeDot={false}
                tooltipType="none"
              />
                            
              {/* Fitness line (CTL) - Blue like intervals.icu */}
              <Line 
                yAxisId="fitness"
                type="monotone" 
                dataKey="ctl" 
                name="(CTL)" 
                stroke="#3b82f6" 
                strokeWidth={2.5}
                dot={false}
              />
              
              {/* Fatigue line (ATL) - Cyan like intervals.icu */}
              <Line 
                yAxisId="fitness"
                type="monotone" 
                dataKey="atl" 
                name="(ATL)" 
                stroke="#06b6d4" 
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-3 text-xs text-gray-600">
          <p>
            <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: '#3b82f6' }}></span>
            <strong>The blue line shows fitness.</strong> This is an exponentially weighted moving average of your training load.
            <span className="inline-block w-3 h-3 rounded mx-2" style={{ backgroundColor: '#06b6d4' }}></span>
            <strong>The cyan line shows fatigue.</strong> To get fitter you need to create stress by increasing training load i.e. keeping the fatigue line above the fitness line.
          </p>
        </div>
      </div>

      {/* Form (TSB) Chart - Lower chart like intervals.icu */}
      <div className="card-mobile">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-600" />
          Form - TSB
        </h2>
        <div className="h-48 relative">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fitnessData} margin={{ top: 10, right: 80, left: -35, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              
              {/* Background zones for Form */}
              <ReferenceArea y1={25} y2={50} fill="#10b981" fillOpacity={0.15} />
              <ReferenceArea y1={5} y2={25} fill="#22c55e" fillOpacity={0.15} />
              <ReferenceArea y1={-10} y2={5} fill="#9ca3af" fillOpacity={0.1} />
              <ReferenceArea y1={-30} y2={-10} fill="#f59e0b" fillOpacity={0.2} />
              <ReferenceArea y1={-50} y2={-30} fill="#ef4444" fillOpacity={0.15} />
              
              <XAxis 
                dataKey="dateFormatted" 
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                axisLine={{ stroke: '#d1d5db' }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                domain={[-50, 50]}
                ticks={[-50, -30, -10, 5, 25, 50]}
                axisLine={{ stroke: '#d1d5db' }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                formatter={(value, name) => [Math.round(value), name]}
                labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
              />
              
              {/* Form line */}
              <Area 
                type="monotone" 
                dataKey="form" 
                name="(TSB)" 
                fill="#22c55e"
                fillOpacity={0.3}
                stroke="#22c55e"
                strokeWidth={2}
              />
              
              {/* Reference line at 0 */}
              <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
          
          {/* Zone labels on right side - positioned absolutely like intervals.icu */}
          <div className="absolute right-0 top-[10px] bottom-[25px] flex flex-col justify-between text-[10px] font-medium pr-1" style={{ width: '45px' }}>
            <span className="text-emerald-500 text-right">Fresh</span>
            <span className="text-green-500 text-right">Transition</span>
            <span className="text-gray-400 text-right">Grey Zone</span>
            <span className="text-amber-500 text-right">Optimal</span>
            <span className="text-red-500 text-right">High Risk</span>
          </div>
        </div>
        
        <div className="mt-2 text-xs text-gray-600">
          <p>
            Your form is your fitness less your fatigue. When your form is in <span className="text-emerald-600 font-medium">fresh</span> and you are fit then you are ready to race.
            Avoid staying in the <span className="text-red-600 font-medium">high risk zone</span> for too long or you might become over trained.
            You need to include periodic rest weeks in your training to recover from fatigue and to be at your best for goal events.
          </p>
        </div>
      </div>

      {/* HRV Chart */}
      {hasHrvData && (
        <div className="card-mobile">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-600" />
            Heart Rate Variability (HRV)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={fitnessData} margin={{ top: 5, right: 5, left: -35, bottom: 5 }}>
                <defs>
                  <linearGradient id="hrvGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="dateFormatted" 
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Legend />
                {fitnessData.some(d => d.hrv !== null) && (
                  <Area 
                    type="monotone" 
                    dataKey="hrv" 
                    stroke="none"
                    fill="url(#hrvGradient)"
                    isAnimationActive={false}
                    legendType="none"
                    activeDot={false}
                    tooltipType="none"
                    connectNulls
                  />
                )}
                {fitnessData.some(d => d.hrv !== null) && (
                  <Line 
                    type="monotone" 
                    dataKey="hrv" 
                    name="HRV (rMSSD)" 
                    stroke="#ec4899" 
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
                {fitnessData.some(d => d.hrvSDNN !== null) && (
                  <Line 
                    type="monotone" 
                    dataKey="hrvSDNN" 
                    name="HRV (SDNN)" 
                    stroke="#f472b6" 
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
                {fitnessData.some(d => d.restingHR !== null) && (
                  <Line 
                    type="monotone" 
                    dataKey="restingHR" 
                    name="Resting HR" 
                    stroke="#f87171" 
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* HRV interpretation guide - age-based reference ranges */}
          <div className="mt-3 text-xs text-gray-600 space-y-2">
            <p className="flex flex-wrap items-center gap-x-1 gap-y-1">
              <span>
                <strong>HRV (rMSSD)</strong> reflects recovery and stress (higher is generally better). Reference ranges for age {hrvBracket.label}
              </span>
              {ageKnown ? (
                <span className="inline-flex items-center rounded-full bg-pink-100 text-pink-700 px-2 py-0.5 font-medium">
                  Your age group
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium" title="Add your date of birth in your profile for age-adjusted ranges">
                  Age not set — using default
                </span>
              )}
              {avgHrv !== null && (
                <span>— your average is <strong>{avgHrv} ms</strong>{hrvActiveIndex >= 0 && <> (<strong className={HRV_CATEGORIES[hrvActiveIndex].text}>{HRV_CATEGORIES[hrvActiveIndex].name}</strong>)</>}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {getHrvRangeLabels(hrvBracket.t).map((label, i) => (
                <span
                  key={i}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${i === hrvActiveIndex ? 'ring-2 ring-offset-1 ring-current bg-gray-50' : ''}`}
                >
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${HRV_CATEGORIES[i].dot}`} />
                  <strong className={HRV_CATEGORIES[i].text}>{HRV_CATEGORIES[i].name}:</strong> {label}
                </span>
              ))}
            </div>
            <p className="text-gray-400">Approximate population-based guidance, not medical thresholds.</p>
            <p>
              <strong>Resting HR:</strong> lower is generally better. A rising resting heart rate often signals fatigue, stress, or oncoming illness.
            </p>
          </div>
        </div>
      )}

      {/* Sleep Chart */}
      {hasSleepData && (
        <div className="card-mobile">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Moon className="h-5 w-5 text-indigo-600" />
            Sleep Data
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={fitnessData} margin={{ top: 5, right: 5, left: -35, bottom: 5 }}>
                <defs>
                  <linearGradient id="sleepGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="dateFormatted" 
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  yAxisId="left" 
                  tick={{ fontSize: 11 }} 
                  domain={[0, 'auto']}
                  tickFormatter={(value) => { 
                    if (value === undefined || value === null || isNaN(value)) return '0h';
                    const h = Math.floor(value); 
                    const m = Math.round((value - h) * 60); 
                    return m > 0 ? `${h}h${m}m` : `${h}h`; 
                  }} 
                />
                {fitnessData.some(d => d.sleepScore !== null) && (
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    tick={{ fontSize: 11 }} 
                    domain={[0, 100]}
                    label={{ value: 'Sleep Score', angle: 90, position: 'insideRight', fontSize: 10, fill: '#a855f7' }}
                  />
                )}
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  formatter={(value, name) => {
                    if (name === 'Sleep') {
                      const h = Math.floor(value);
                      const m = Math.round((value - h) * 60);
                      return [m > 0 ? `${h}h ${m}min` : `${h}h`, name];
                    }
                    return [value, name];
                  }}
                />
                <Area 
                  yAxisId="left"
                  type="linear" 
                  dataKey="sleepHours" 
                  stroke="none"
                  fill="url(#sleepGradient)"
                  isAnimationActive={false}
                  legendType="none"
                  activeDot={false}
                  tooltipType="none"
                  connectNulls
                />
                <Line 
                  yAxisId="left"
                  type="linear" 
                  dataKey="sleepHours" 
                  name="Sleep" 
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
                {fitnessData.some(d => d.sleepScore !== null) && (
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="sleepScore" 
                    name="Sleep Score" 
                    stroke="#a855f7" 
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Custom legend below chart */}
          <div className="flex justify-center gap-4 mt-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 bg-indigo-500" />
              <span>Sleep (hours)</span>
            </div>
            {fitnessData.some(d => d.sleepScore !== null) && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-1 bg-purple-500 rounded" />
                <span>Sleep Score</span>
              </div>
            )}
          </div>
          {/* Sleep Score interpretation guide */}
          {fitnessData.some(d => d.sleepScore !== null) && (
            <div className="mt-3 text-xs text-gray-600 space-y-2">
              <p>
                <strong>Sleep Score</strong> (0–100) rates the quality and restfulness of your sleep
                {avgSleepScore !== null && (
                  <> — your average is <strong>{avgSleepScore}</strong>{sleepScoreActiveIndex >= 0 && <> (<strong className={SLEEP_SCORE_CATEGORIES[sleepScoreActiveIndex].text}>{SLEEP_SCORE_CATEGORIES[sleepScoreActiveIndex].name}</strong>)</>}</>
                )}:
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {SLEEP_SCORE_CATEGORIES.map((cat, i) => (
                  <span
                    key={i}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${i === sleepScoreActiveIndex ? 'ring-2 ring-offset-1 ring-current bg-gray-50' : ''}`}
                  >
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${cat.dot}`} />
                    <strong className={cat.text}>{cat.name}:</strong> {cat.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FitnessChart;
