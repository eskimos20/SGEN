import { Loader2, Search, X } from 'lucide-react';
import { getSportEmoji } from '../../utils/sportTypeUtils';
import HRZonesTable from './HRZonesTable';
import PowerZonesTable from './PowerZonesTable';

const formatActivityType = (type) => {
  if (!type) return '';
  return type.replace(/([A-Z])/g, ' $1').trim();
};

const SportSettingsFields = ({ 
  editForm, 
  setEditForm, 
  availableActivityTypes, 
  loadingActivityTypes,
  allSportSettings 
}) => {
  return (
    <>
      {/* Activity Sub-Types Management */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Activity Types</label>
        {/* Current types */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(editForm.sportTypes || []).map(type => (
            <span
              key={type}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-200"
            >
              <span>{getSportEmoji(type)}</span>{formatActivityType(type)}
              {editForm.sportTypes.length > 1 && (
                <button
                  onClick={() => setEditForm(prev => ({
                    ...prev,
                    sportTypes: prev.sportTypes.filter(t => t !== type)
                  }))}
                  className="ml-0.5 hover:bg-blue-200 rounded-lg p-0.5 transition-colors"
                  title={`Remove ${formatActivityType(type)}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {/* Add more types */}
        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={editForm.editTypeSearch || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, editTypeSearch: e.target.value }))}
              placeholder="Search types to add..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
            />
          </div>
          {loadingActivityTypes ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 mr-1.5" />
              <span className="text-xs text-gray-500">Loading...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {availableActivityTypes
                .filter(type => !(editForm.sportTypes || []).includes(type))
                .filter(type => {
                  const otherSportsTypes = allSportSettings
                    .filter(s => s.id !== editForm.sportId)
                    .flatMap(s => s.types || []);
                  return !otherSportsTypes.includes(type);
                })
                .filter(type => {
                  if (!editForm.editTypeSearch) return true;
                  const search = editForm.editTypeSearch.toLowerCase();
                  return type.toLowerCase().includes(search) || formatActivityType(type).toLowerCase().includes(search);
                })
                .map(type => (
                  <button
                    key={type}
                    onClick={() => setEditForm(prev => ({
                      ...prev,
                      sportTypes: [...(prev.sportTypes || []), type]
                    }))}
                    className="px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-gray-700"
                  >
                    + {getSportEmoji(type)} {formatActivityType(type)}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* FTP Toggle */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={editForm.supportsPower || false}
            onChange={(e) => {
              const enabled = e.target.checked;
              setEditForm(prev => ({
                ...prev,
                supportsPower: enabled,
                sportFtp: enabled ? (prev.sportFtp || '') : '',
                sportPowerZones: enabled ? prev.sportPowerZones : []
              }));
            }}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
        <span className="text-sm font-medium text-gray-700">
          {editForm.supportsPower ? 'FTP Enabled' : 'FTP Disabled'}
        </span>
        {!editForm.supportsPower && !editForm.originalSupportsPower && (
          <span className="text-xs text-gray-500">Enable to add FTP for this sport</span>
        )}
        {!editForm.supportsPower && editForm.originalSupportsPower && (
          <span className="text-xs text-red-500">FTP will be removed on save</span>
        )}
      </div>

      {/* Top row: FTP, Max HR, LTHR */}
      <div className={`grid gap-4 ${editForm.supportsPower ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {editForm.supportsPower && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">FTP (W)</label>
            <input
              type="number"
              value={editForm.sportFtp}
              onChange={(e) => setEditForm(prev => ({ ...prev, sportFtp: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter FTP"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max HR</label>
          <input
            type="number"
            value={editForm.sportMaxHr}
            onChange={(e) => setEditForm(prev => ({ ...prev, sportMaxHr: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter Max HR"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">LTHR</label>
          <input
            type="number"
            value={editForm.sportLthr}
            onChange={(e) => setEditForm(prev => ({ ...prev, sportLthr: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter LTHR"
          />
        </div>
      </div>

      {/* Zones side by side */}
      <div className={`grid gap-6 mt-4 ${editForm.supportsPower ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {editForm.sportHrZones && editForm.sportHrZones.length > 0 && (
          <HRZonesTable editForm={editForm} setEditForm={setEditForm} />
        )}

        {editForm.supportsPower && editForm.sportPowerZones && editForm.sportPowerZones.length > 0 && (
          <PowerZonesTable editForm={editForm} setEditForm={setEditForm} />
        )}
      </div>
    </>
  );
};

export default SportSettingsFields;
