import React, { useState, useMemo, useCallback } from 'react';
import { Bike, Footprints, Watch, Wrench, AlertTriangle, Plus, History, Edit, Trash2 } from 'lucide-react';
import GearMaintenanceModal from './GearMaintenanceModal';
import GearMaintenanceHistory from './GearMaintenanceHistory';

const GearList = ({ gear, maintenance = [], onEdit, onDelete }) => {
  const [selectedGear, setSelectedGear] = useState(null);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const handleAddMaintenance = useCallback((item) => {
    setSelectedGear(item);
    setShowMaintenanceModal(true);
  }, []);

  const handleViewHistory = useCallback((item) => {
    setSelectedGear(item);
    setShowHistoryModal(true);
  }, []);

  const handleMaintenanceSaved = useCallback(() => {
    // Optionally refresh gear list or show success message
  }, []);

  // Calculate cost summaries - memoized to avoid recalculation on every render
  const { costByYear, costByGear, costByGearByYear, totalCost, currentYear } = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const costByYear = {};
    const costByGear = {};
    const costByGearByYear = {}; // New: costs per gear per year
    let totalCost = 0;

    maintenance.forEach(m => {
      if (m.cost && m.cost > 0) {
        const year = new Date(m.serviceDate).getFullYear();
        
        // Sum by year
        costByYear[year] = (costByYear[year] || 0) + m.cost;
        
        // Sum by gear
        costByGear[m.gearId] = costByGear[m.gearId] || { name: m.gearName, cost: 0 };
        costByGear[m.gearId].cost += m.cost;
        
        // Sum by gear by year
        if (!costByGearByYear[m.gearId]) {
          costByGearByYear[m.gearId] = { name: m.gearName, years: {}, total: 0 };
        }
        costByGearByYear[m.gearId].years[year] = (costByGearByYear[m.gearId].years[year] || 0) + m.cost;
        costByGearByYear[m.gearId].total += m.cost;
        
        totalCost += m.cost;
      }
    });

    return { costByYear, costByGear, costByGearByYear, totalCost, currentYear };
  }, [maintenance]);

  if (!gear || gear.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Bike className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>No gear found</p>
      </div>
    );
  }

  const formatDistance = (meters) => {
    if (!meters) return '0 km';
    const km = meters / 1000;
    return `${Math.round(km).toLocaleString()} km`;
  };

  const formatTime = (seconds) => {
    if (!seconds) return '0h';
    const hours = seconds / 3600;
    return `${hours.toFixed(0)}h`;
  };

  const getGearIcon = (type) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('bike') || t.includes('cycle')) return <Bike className="h-6 w-6" />;
    if (t.includes('shoe') || t.includes('run')) return <Footprints className="h-6 w-6" />;
    if (t.includes('watch')) return <Watch className="h-6 w-6" />;
    return <Wrench className="h-6 w-6" />;
  };

  const getGearTypeColor = (type) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('bike') || t.includes('cycle')) return 'bg-blue-100 text-blue-600';
    if (t.includes('shoe') || t.includes('run')) return 'bg-green-100 text-green-600';
    if (t.includes('watch')) return 'bg-purple-100 text-purple-600';
    return 'bg-gray-100 text-gray-600';
  };

  const hasServiceReminder = (item) => {
    return item.reminders && item.reminders.length > 0;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Wrench className="h-5 w-5 text-gray-600" />
        Gear & Equipment
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {gear.map((item, idx) => {
          // Handle both intervals.icu field names and standard names
          const distance = item.distance || item.total_distance || 0;
          const time = item.moving_time || item.total_time || item.time || 0;
          const activities = item.activity_count || item.activities || item.count || 0;
          const gearType = item.type || item.gear_type || (item.name?.toLowerCase().includes('bike') ? 'Bike' : 'Equipment');
          
          const isRetired = item.retired || item.removedFromStrava;
          
          return (
            <div 
              key={item.id || idx} 
              className={`bg-white rounded-xl border p-3 sm:p-4 sm:shadow-sm hover:shadow-md transition-shadow ${
                isRetired ? 'border-gray-300 bg-gray-50' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${getGearTypeColor(gearType)} ${isRetired ? 'opacity-60' : ''}`}>
                    {getGearIcon(gearType)}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{item.name}</h4>
                    <p className="text-sm text-gray-500 capitalize">{gearType}</p>
                    {isRetired && (
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium mt-1 inline-block">Retired</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Maintenance buttons */}
                  <button
                    onClick={() => handleAddMaintenance(item)}
                    className="p-2 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors"
                    title="Add Service"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleViewHistory(item)}
                    className="p-2 hover:bg-gray-100 text-gray-600 rounded-xl transition-colors mr-1"
                    title="History"
                  >
                    <History className="h-5 w-5" />
                  </button>
                  {onEdit && onDelete && (
                    <>
                      {/* Edit button - only for non-retired gear */}
                      {!isRetired && (
                        <button
                          onClick={() => onEdit(item)}
                          className="p-2 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors"
                          title="Edit gear"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                      )}
                      {/* Delete button - with margin from corner */}
                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-2 hover:bg-red-100 text-red-600 rounded-xl transition-colors mr-1"
                        title={isRetired ? 'Remove gear' : 'Delete gear'}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <p className="text-gray-500">Distance</p>
                  <p className="font-semibold text-gray-900 text-lg">{formatDistance(distance)}</p>
                </div>
                {time > 0 && (
                  <div>
                    <p className="text-gray-500">Time</p>
                    <p className="font-semibold text-gray-900">{formatTime(time)}</p>
                  </div>
                )}
                {activities > 0 && (
                  <div>
                    <p className="text-gray-500">Activities</p>
                    <p className="font-semibold text-gray-900">{activities}</p>
                  </div>
                )}
                {item.brand && (
                  <div>
                    <p className="text-gray-500">Brand</p>
                    <p className="font-semibold text-gray-900">{item.brand}</p>
                  </div>
                )}
              </div>

              {hasServiceReminder(item) && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Service reminder active</span>
                  </div>
                </div>
              )}

              {/* Maintenance Actions */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                <button
                  onClick={() => handleAddMaintenance(item)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Add Service
                </button>
                <button
                  onClick={() => handleViewHistory(item)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors text-sm font-medium"
                >
                  <History className="h-4 w-4" />
                  History
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cost Summary Table */}
      {totalCost > 0 && (
        <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-3 sm:p-6 border border-blue-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-600" />
            Service Costs Summary
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full bg-white rounded-xl overflow-hidden border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Gear</th>
                  {Object.keys(costByYear)
                    .sort((a, b) => parseInt(b) - parseInt(a))
                    .map(year => (
                      <th key={year} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                        {year}
                        {parseInt(year) === currentYear && (
                          <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Now</span>
                        )}
                      </th>
                    ))}
                  <th className="px-4 py-3 text-right text-sm font-semibold text-blue-700 bg-blue-50">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Object.entries(costByGearByYear)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([gearId, data]) => (
                    <tr key={gearId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{data.name}</td>
                      {Object.keys(costByYear)
                        .sort((a, b) => parseInt(b) - parseInt(a))
                        .map(year => (
                          <td key={year} className="px-4 py-3 text-right text-sm text-gray-700">
                            {data.years[year] ? `${data.years[year].toLocaleString()} kr` : '-'}
                          </td>
                        ))}
                      <td className="px-4 py-3 text-right text-sm font-bold text-blue-900 bg-blue-50">
                        {data.total.toLocaleString()} kr
                      </td>
                    </tr>
                  ))}
                <tr className="bg-green-50 font-bold">
                  <td className="px-4 py-3 text-sm text-green-900">Total per Year</td>
                  {Object.entries(costByYear)
                    .sort(([a], [b]) => parseInt(b) - parseInt(a))
                    .map(([year, cost]) => (
                      <td key={year} className="px-4 py-3 text-right text-sm text-green-900">
                        {cost.toLocaleString()} kr
                      </td>
                    ))}
                  <td className="px-4 py-3 text-right text-base font-bold text-green-900 bg-green-100">
                    {totalCost.toLocaleString()} kr
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <GearMaintenanceModal
        isOpen={showMaintenanceModal}
        onClose={() => setShowMaintenanceModal(false)}
        gearItem={selectedGear}
        onSaved={handleMaintenanceSaved}
      />
      <GearMaintenanceHistory
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        gearItem={selectedGear}
      />
    </div>
  );
};

export default React.memo(GearList);
