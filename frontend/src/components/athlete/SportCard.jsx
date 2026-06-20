import { Settings, Trash2, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getSportColorClasses } from '../../utils/athleteUtils';

const formatActivityType = (type) => {
  if (!type) return '';
  return type.replace(/([A-Z])/g, ' $1').trim();
};

const SportCard = ({
  settings,
  category,
  weight,
  deletingSportId,
  updateActivitiesState,
  onEdit,
  onDelete,
  onUpdateActivities,
  onApplySettings,
  onCancelUpdate
}) => {
  const ftp = settings.ftp;
  const lthr = settings.lthr;
  const maxHr = settings.max_hr;
  const hrZones = settings.hr_zones;
  const powerZones = settings.power_zones;
  const hasHrZones = hrZones && hrZones.length > 0;
  const hasPowerZones = powerZones && powerZones.length > 0 && ftp > 0;
  const us = updateActivitiesState[settings.id] || {};

  return (
    <div className={`bg-gradient-to-br ${getSportColorClasses(category.color)} border rounded-xl sm:shadow-sm p-3 sm:p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{category.icon}</span>
          <div>
            <h3 className="font-semibold text-gray-900">{category.name}</h3>
            {settings.types && settings.types.length > 1 && (
              <div className="text-xs text-gray-500">
                {settings.types.map(t => formatActivityType(t)).join(', ')}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(settings, category)}
            className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
            title={`Edit ${category.name} Settings`}
          >
            <Settings className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={() => onDelete(settings.id, category.name)}
            disabled={deletingSportId === settings.id}
            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
            title={`Delete ${category.name}`}
          >
            {deletingSportId === settings.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-red-500" />
            ) : (
              <Trash2 className="h-4 w-4 text-red-400 hover:text-red-600" />
            )}
          </button>
        </div>
      </div>

      {/* Update Activities section */}
      {(() => {
        if (us.done) {
          return (
            <div className="flex items-center gap-1.5 mb-3 text-green-700 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Update started on Intervals.icu
            </div>
          );
        }
        if (us.applying) {
          return (
            <div className="flex items-center gap-1.5 mb-3 text-blue-600 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
              Starting update...
            </div>
          );
        }
        if (us.count != null) {
          return (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-600">
                {us.count === 0
                  ? 'No matching activities'
                  : `Update ${us.count} activit${us.count !== 1 ? 'ies' : 'y'} with current settings?`}
              </span>
              {us.count > 0 && (
                <button
                  onClick={() => onApplySettings(settings.id)}
                  className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Yes, update
                </button>
              )}
              <button
                onClick={() => onCancelUpdate(settings.id)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          );
        }
        if (us.error) {
          return (
            <div className="text-xs text-red-600 mb-3">Failed — please try again</div>
          );
        }
        return (
          <button
            onClick={() => onUpdateActivities(settings.id)}
            disabled={us.loading}
            className="flex items-center gap-1.5 mb-3 text-xs text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50"
            title="Update activities with current zone/FTP settings"
          >
            {us.loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Update activities
          </button>
        );
      })()}
      
      {/* Key Metrics */}
      <div className="flex flex-wrap gap-2 mb-3">
        {lthr > 0 && (
          <span className="px-2 py-1 bg-white/90 sm:bg-white sm:rounded text-sm font-medium">LTHR: {lthr}</span>
        )}
        {maxHr > 0 && (
          <span className="px-2 py-1 bg-white/90 sm:bg-white sm:rounded text-sm font-medium">Max HR: {maxHr}</span>
        )}
        {ftp > 0 && (
          <span className="px-2 py-1 bg-white/90 sm:bg-white sm:rounded text-sm font-medium">
            FTP: {ftp}W
            {weight > 0 && <span className="text-gray-500 ml-1">({(ftp/weight).toFixed(2)} W/kg)</span>}
          </span>
        )}
      </div>
      
      {/* HR Zones */}
      {hasHrZones && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-600 mb-1">Heart Rate Zones</h4>
          <div className="flex flex-wrap gap-1">
            {hrZones.map((zone, zIdx) => {
              const prevZone = zIdx > 0 ? hrZones[zIdx - 1] : 0;
              const isLastZone = zIdx === hrZones.length - 1;
              
              let rangeDisplay;
              if (isLastZone) {
                rangeDisplay = `${zone}+`;
              } else if (zIdx === 0) {
                rangeDisplay = `1-${zone}`;
              } else {
                rangeDisplay = `${prevZone + 1}-${zone}`;
              }
              
              return (
                <span key={zIdx} className="text-xs px-1.5 py-0.5 bg-white/90 sm:bg-white sm:rounded">
                  Z{zIdx + 1}: {rangeDisplay}
                </span>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Power Zones */}
      {hasPowerZones && (
        <div>
          <h4 className="text-xs font-medium text-gray-600 mb-1">Power Zones</h4>
          <div className="flex flex-wrap gap-1">
            {powerZones.map((zone, zIdx) => {
              const isZ7 = zIdx === 6 && zone >= 999;
              const currentWatts = Math.round(ftp * zone / 100);
              const prevZone = zIdx > 0 ? powerZones[zIdx - 1] : 0;
              const prevWatts = zIdx > 0 ? Math.round(ftp * prevZone / 100) : 0;
              
              let rangeDisplay;
              if (isZ7) {
                const z7Start = prevWatts + 1;
                rangeDisplay = `${z7Start}W+`;
              } else if (zIdx === 0) {
                rangeDisplay = `1-${currentWatts}W`;
              } else {
                rangeDisplay = `${prevWatts + 1}-${currentWatts}W`;
              }
              
              return (
                <span key={zIdx} className="text-xs px-1.5 py-0.5 bg-white/90 sm:bg-white sm:rounded">
                  Z{zIdx + 1}: {rangeDisplay}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SportCard;
