import { useMemo } from 'react';
import { Activity, Clock3, Mountain, Route, Zap, Flame, Dumbbell, Gauge, Loader2 } from 'lucide-react';
import { buildTrainingTotals } from '../../utils/trainingTotalsUtils';

const ZONE_COLORS = ['#36b6a1', '#31ad45', '#f5cf31', '#ff8b2b', '#ec4899', '#df3f78', '#7751a8'];
const formatTime = (seconds) => {
  const hours = Math.floor((seconds || 0) / 3600);
  const minutes = Math.floor(((seconds || 0) % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h${String(minutes).padStart(2, '0')}m`;
};

const formatNumber = (value, digits = 0) => new Intl.NumberFormat('sv-SE', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(value || 0);

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
        <p className="text-xs text-gray-400 py-2">Ingen zondata</p>
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
  const sharePercent = (value) => distribution.total ? value / distribution.total * 100 : 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Training Totals</h3>
          <p className="text-xs text-gray-500 mt-0.5">Välj datumintervall för träningssummeringen</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 text-blue-600 animate-spin flex-shrink-0 mt-1" aria-label="Laddar träningssummering" />}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-3 mb-4">
        <label className="block text-xs font-medium text-gray-600">
          Från
          <input
            type="date"
            value={oldest}
            max={newest || undefined}
            onChange={(event) => onOldestChange?.(event.target.value)}
            className="mt-1 block w-full sm:w-auto rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800"
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          Till
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
        <p className="text-sm text-gray-500 py-4">Inga aktiviteter i den valda perioden.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-5">
            <Metric icon={Activity} label="Aktiviteter" value={totals.activities} />
            <Metric icon={Clock3} label="Veckor / dagar" value={`${totals.weeks} / ${totals.days}`} detail={`${totals.activeDays} aktiva dagar`} />
            <Metric icon={Clock3} label="Tid" value={formatTime(totals.time)} />
            <Metric icon={Route} label="Distans" value={`${formatNumber(totals.distance / 1000, 1)} km`} />
            <Metric icon={Mountain} label="Stigning" value={`${formatNumber(totals.climbing)} m`} />
            <Metric icon={Zap} label="Belastning" value={formatNumber(totals.load)} />
            <Metric icon={Flame} label="Kalorier" value={formatNumber(totals.calories)} />
            <Metric icon={Dumbbell} label="Lyft" value={`${formatNumber(totals.weightLifted)} kg`} />
            <Metric icon={Gauge} label="Arbete" value={`${formatNumber(totals.work / 1000)} kJ`} />
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
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{distribution.label}</span>
                {distribution.polarizationIndex !== null && (
                  <span className="text-xs text-gray-500">PI {distribution.polarizationIndex.toFixed(2)}</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex h-3 overflow-hidden rounded-full bg-white">
                {[distribution.s1, distribution.s2, distribution.s3].map((value, index) => (
                  <div key={index} style={{ width: `${sharePercent(value)}%`, backgroundColor: ['#35b6a1', '#ff9b36', '#e83e72'][index] }} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 tabular-nums">
                <span><span className="inline-block h-2 w-2 rounded-full bg-teal-500 mr-1" />S1+2 {sharePercent(distribution.s1).toFixed(1)}%</span>
                <span><span className="inline-block h-2 w-2 rounded-full bg-orange-400 mr-1" />S3+4 {sharePercent(distribution.s2).toFixed(1)}%</span>
                <span><span className="inline-block h-2 w-2 rounded-full bg-pink-600 mr-1" />S5+ {sharePercent(distribution.s3).toFixed(1)}%</span>
              </div>
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
          <p className="text-[11px] text-gray-400 mt-3">Combined Zones väljer aktivitetens första tillgängliga zonkälla enligt Intervals.icu:s tiz_order. Aktiviteter utan cardiovaskulär zondata ingår inte i klassningen.</p>
        </>
      )}
    </section>
  );
};

export default TrainingTotalsPanel;
