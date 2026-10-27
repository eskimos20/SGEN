import { useMemo } from 'react';
import { Activity, Clock3, Mountain, Route, Zap, Flame, Dumbbell, Gauge, Loader2, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { buildTrainingTotals } from '../../utils/trainingTotalsUtils';
import { usePersistentPreference } from '../../hooks/usePersistentPreference';

const ZONE_COLORS = ['#36b6a1', '#31ad45', '#f5cf31', '#ff8b2b', '#ec4899', '#df3f78', '#7751a8'];
const DISTRIBUTION_PROFILES = [
  { label: 'Polarized', shares: [0.84, 0.08, 0.34] },
  { label: 'Pyramidal', shares: [0.8, 0.55, 0.34] },
  { label: 'Threshold', shares: [0.55, 0.82, 0.34] },
  { label: 'HIIT', shares: [0.34, 0.42, 0.9] },
  { label: 'Base', shares: [0.9, 0.22, 0.08] },
  { label: 'Unique', shares: [0.48, 0.72, 0.52] },
];
const DISTRIBUTION_COLORS = ['#35b64b', '#ff9b36', '#e83e72'];
const formatTime = (seconds) => {
  const hours = Math.floor((seconds || 0) / 3600);
  const minutes = Math.floor(((seconds || 0) % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h${String(minutes).padStart(2, '0')}m`;
};

const formatNumber = (value, digits = 0) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(value || 0);

const DistributionProfile = ({ profile, selected, distribution }) => (
  <div
    className={`relative rounded border px-2 py-2 transition-all origin-bottom ${selected ? 'z-10 min-w-[148px] border-gray-300 bg-white shadow-md scale-[1.06]' : 'min-w-[88px] border-gray-200 bg-white'}`}
    aria-current={selected ? 'true' : undefined}
  >
    <div className="text-center text-xs leading-5 text-gray-700">
      {profile.label}{selected && distribution.polarizationIndex !== null && (
        <> <strong className="text-gray-900">{distribution.polarizationIndex.toFixed(2)}</strong></>
      )}
    </div>
    {selected ? (
      <div className="space-y-1 mt-1">
        {[
          { label: 'S1+2', value: distribution.s1 },
          { label: 'S3+4', value: distribution.s2 },
          { label: 'S5+', value: distribution.s3 },
        ].map((zone, index) => {
          const percent = distribution.total ? zone.value / distribution.total * 100 : 0;
          return (
            <div key={zone.label} className="grid grid-cols-[30px_minmax(0,1fr)_38px] items-center gap-1 text-[10px] text-gray-700 tabular-nums">
              <span className="font-medium">{zone.label}</span>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: DISTRIBUTION_COLORS[index] }} />
              </div>
              <span className="text-right">{percent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="space-y-1 mt-1">
        {profile.shares.map((share, index) => (
          <div key={index} className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: DISTRIBUTION_COLORS[index] }} />
          </div>
        ))}
      </div>
    )}
  </div>
);

const Metric = ({ icon: Icon, label, value, detail }) => (
  <div className="rounded-lg bg-gray-50 px-3 py-3 text-center min-w-0">
    {Icon && <Icon className="h-4 w-4 text-blue-600 mx-auto mb-1" />}
    <div className="text-base sm:text-lg font-semibold text-gray-900 truncate">{value}</div>
    <div className="text-xs text-gray-600">{label}</div>
    {detail && <div className="text-[11px] text-gray-400 mt-0.5">{detail}</div>}
  </div>
);

const ZoneBars = ({ title, zones, sweetSpot = 0, totalOverride = null }) => {
  const zoneTotal = zones.reduce((sum, seconds) => sum + seconds, 0);
  const total = totalOverride ?? zoneTotal;
  return (
    <section className="min-w-0">
      <h4 className="text-sm font-semibold text-gray-800 mb-2">{title}</h4>
      {total === 0 ? (
        <p className="text-xs text-gray-400 py-2">No zone data</p>
      ) : (
        <div className="space-y-1.5">
          {zones.map((seconds, index) => {
            const percent = total ? seconds / total * 100 : 0;
            return (
              <div key={`${title}-z${index + 1}`} className="grid grid-cols-[24px_minmax(0,1fr)_54px_36px] items-center gap-2 text-xs">
                <span className="text-gray-500">Z{index + 1}</span>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: ZONE_COLORS[index] }} />
                </div>
                <span className="text-right text-gray-700 tabular-nums">{formatTime(seconds)}</span>
                <span className="text-right text-gray-400 tabular-nums">{percent.toFixed(1)}%</span>
              </div>
            );
          })}
          {sweetSpot > 0 && (
            <div className="grid grid-cols-[24px_minmax(0,1fr)_54px_36px] items-center gap-2 text-xs pt-1">
              <span className="text-gray-500">SS</span>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.min(sweetSpot / total * 100, 100)}%` }} />
              </div>
              <span className="text-right text-gray-700 tabular-nums">{formatTime(sweetSpot)}</span>
              <span className="text-right text-gray-400 tabular-nums">{(sweetSpot / total * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const TrainingTotalsPanel = ({
  activities = [],
  periodDays = 30,
  loading = false,
  error = '',
  oldest = '',
  newest = '',
  onOldestChange,
  onNewestChange,
}) => {
  const totals = useMemo(() => buildTrainingTotals(activities, periodDays), [activities, periodDays]);
  const { distribution, zones } = totals;
  const [savedExpanded, setSavedExpanded] = usePersistentPreference('statistics-trainingTotalsExpanded', 'true');
  const isExpanded = savedExpanded === 'true';

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded text-left hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-expanded={isExpanded}
          aria-controls="training-totals-content"
          onClick={() => setSavedExpanded(isExpanded ? 'false' : 'true')}
        >
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Training Totals</h3>
          {isExpanded ? <ChevronUp className="h-5 w-5 shrink-0 text-gray-600" /> : <ChevronDown className="h-5 w-5 shrink-0 text-gray-600" />}
        </button>
        {loading && <Loader2 className="h-4 w-4 text-blue-600 animate-spin flex-shrink-0 mt-1" aria-label="Loading training totals" />}
      </div>

      {isExpanded && <div id="training-totals-content" className="mt-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-3 mb-4">
        <label className="block text-xs font-medium text-gray-600">
          From
          <input
            type="date"
            value={oldest}
            max={newest || undefined}
            onChange={(event) => onOldestChange?.(event.target.value)}
            className="mt-1 block w-full sm:w-auto rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800"
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          To
          <input
            type="date"
            value={newest}
            min={oldest || undefined}
            onChange={(event) => onNewestChange?.(event.target.value)}
            className="mt-1 block w-full sm:w-auto rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800"
          />
        </label>
      </div>

      {error ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{error}</p>
      ) : activities.length === 0 && !loading ? (
        <p className="text-sm text-gray-500 py-4">No activities in the selected period.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-5">
            <Metric icon={Activity} label="Activities" value={totals.activities} />
            <Metric icon={Clock3} label="Weeks / days" value={`${totals.weeks} / ${totals.days}`} detail={`${totals.activeDays} active days`} />
            <Metric icon={Clock3} label="Duration" value={formatTime(totals.time)} />
            <Metric icon={Route} label="Distance" value={`${formatNumber(totals.distance / 1000, 1)} km`} />
            <Metric icon={Mountain} label="Elevation" value={`${formatNumber(totals.climbing)} m`} />
            <Metric icon={Zap} label="Load" value={formatNumber(totals.load)} />
            <Metric icon={Flame} label="Calories" value={formatNumber(totals.calories)} />
            <Metric icon={Dumbbell} label="Weight lifted" value={`${formatNumber(totals.weightLifted)} kg`} />
            <Metric icon={Gauge} label="Work" value={`${formatNumber(totals.work / 1000)} kJ`} />
            <Metric label="Coasting" value={formatTime(totals.coasting)} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 border-t border-gray-100 pt-4">
            <ZoneBars title="Combined Zones" zones={zones.combined} sweetSpot={zones.combinedSweetSpot} />
            <ZoneBars title="Power Zones" zones={zones.power} sweetSpot={zones.powerSweetSpot} />
            <ZoneBars title="Heart Rate Zones" zones={zones.hr} />
            <ZoneBars title="Pace Zones" zones={zones.pace} />
          </div>

          <div className="border-t border-gray-100 mt-5 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-semibold text-gray-800">Training Intensity Distribution</h4>
            </div>
            <div className="flex items-start gap-3 py-3">
              <div className="flex flex-1 flex-wrap items-end gap-2">
                {DISTRIBUTION_PROFILES.map((profile) => (
                  <DistributionProfile
                    key={profile.label}
                    profile={profile}
                    distribution={distribution}
                    selected={distribution.label === profile.label}
                  />
                ))}
              </div>
              <details className="relative ml-auto shrink-0">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 [&::-webkit-details-marker]:hidden">
                  <HelpCircle className="h-4 w-4" />
                  Help
                </summary>
                <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-700 shadow-xl">
                  <h5 className="mb-1 font-semibold text-gray-900">How the classifications work</h5>
                  <p className="mb-3 leading-relaxed">Time in your combined zones is grouped into S1 (Z1–Z2), S2 (Z3–Z4), and S3 (Z5–Z7). The rules below are checked in order; the first match is your classification.</p>
                  <div className="space-y-2.5">
                    <p><strong>HIIT:</strong> S3 is greater than S2, and greater than 49.9% of the time in S1 and S2 combined.</p>
                    <p><strong>Polarized:</strong> S1 and S3 are both greater than S2.</p>
                    <p><strong>Base:</strong> S1 is more than 3.99 times S2, and more than 3 times S2 and S3 combined.</p>
                    <p><strong>Pyramidal:</strong> S1 is more than 1.4 times S2; S2 is more than 1.4 times S3; and S3 is at least 5% of total zone time.</p>
                    <p><strong>Threshold:</strong> S1 is less than 4 times S2, and S2 is greater than half of S3.</p>
                    <p><strong>Unique:</strong> None of the rules above match.</p>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {totals.sports.length > 0 && (
            <div className="border-t border-gray-100 mt-4 pt-3">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">Per sport</h4>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {totals.sports.map((sport) => (
                  <div key={sport.type} className="text-xs text-gray-600">
                    <span className="font-medium text-gray-800">{sport.type}</span> · {formatTime(sport.time)} · {formatNumber(sport.distance / 1000, 1)} km · Load {formatNumber(sport.load)}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-3">Combined Zones uses each activity’s first available zone source according to Intervals.icu’s tiz_order. Activities without cardiovascular zone data are not included in the classification.</p>
        </>
      )}
      </div>}
    </section>
  );
};

export default TrainingTotalsPanel;
