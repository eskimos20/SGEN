import { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, User, Wrench, Plus, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const emptyRow = (defaultDate, defaultDistance) => ({
  serviceDate: defaultDate,
  distanceAtService: defaultDistance,
  serviceType: '',
  description: '',
  cost: '',
  performedBy: 'Self'
});

const GearMaintenanceModal = ({ isOpen, onClose, gearItem, maintenanceRecord, onSaved }) => {
  useLockBodyScroll(isOpen);

  const isEditMode = Boolean(maintenanceRecord);

  // Single-record form state (edit mode only)
  const [formData, setFormData] = useState({
    serviceDate: new Date().toISOString().split('T')[0],
    distanceAtService: '',
    serviceType: '',
    description: '',
    cost: '',
    performedBy: 'Self'
  });

  // Multi-row state (add mode)
  const [rows, setRows] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && gearItem) {
      setError('');
      if (isEditMode) {
        setFormData({
          serviceDate: maintenanceRecord.serviceDate,
          distanceAtService: maintenanceRecord.distanceAtService ? Math.round(maintenanceRecord.distanceAtService / 1000) : '',
          serviceType: maintenanceRecord.serviceType || '',
          description: maintenanceRecord.description || '',
          cost: maintenanceRecord.cost || '',
          performedBy: maintenanceRecord.performedBy || 'Self'
        });
      } else {
        const today = new Date().toISOString().split('T')[0];
        const currentKm = Math.round((gearItem.distance || gearItem.total_distance || 0) / 1000);
        setRows([emptyRow(today, currentKm)]);
      }
    }
  }, [isOpen, gearItem, maintenanceRecord, isEditMode]);

  const updateRow = (index, field, value) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    const prev = rows[rows.length - 1];
    setRows(r => [...r, emptyRow(prev?.serviceDate ?? new Date().toISOString().split('T')[0], prev?.distanceAtService ?? '')]);
  };

  const removeRow = (index) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (isEditMode) {
        const payload = {
          gearId: gearItem.id,
          gearName: gearItem.name,
          serviceDate: formData.serviceDate,
          distanceAtService: formData.distanceAtService ? parseInt(formData.distanceAtService) * 1000 : null,
          serviceType: formData.serviceType,
          description: formData.description,
          cost: formData.cost ? parseFloat(formData.cost) : null,
          performedBy: formData.performedBy
        };
        await api.put(`/gear-maintenance/${maintenanceRecord.id}`, payload);
      } else {
        await Promise.all(
          rows.map(row =>
            api.post('/gear-maintenance', {
              gearId: gearItem.id,
              gearName: gearItem.name,
              serviceDate: row.serviceDate,
              distanceAtService: row.distanceAtService ? parseInt(row.distanceAtService) * 1000 : null,
              serviceType: row.serviceType,
              description: row.description,
              cost: row.cost ? parseFloat(row.cost) : null,
              performedBy: row.performedBy
            })
          )
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save maintenance record');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentKm = Math.round((gearItem?.distance || gearItem?.total_distance || 0) / 1000);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-6xl h-[92vh] sm:h-auto sm:max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl sm:rounded-t-xl">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              {isEditMode ? 'Edit Maintenance Record' : 'Add Service Records'}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {gearItem?.name} · Current distance: {currentKm.toLocaleString()} km
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" title="Close">
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 p-4 sm:p-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                {error}
              </div>
            )}

            {isEditMode ? (
              /* ── Single-record edit form ── */
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline h-4 w-4 mr-1" />Service Date *
                  </label>
                  <input type="date" required value={formData.serviceDate}
                    onChange={e => setFormData({ ...formData, serviceDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Distance at Service (km)</label>
                  <input type="number" value={formData.distanceAtService}
                    onChange={e => setFormData({ ...formData, distanceAtService: e.target.value })}
                    placeholder="e.g. 5000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Wrench className="inline h-4 w-4 mr-1" />Service Type *
                  </label>
                  <input type="text" required value={formData.serviceType}
                    onChange={e => setFormData({ ...formData, serviceType: e.target.value })}
                    placeholder="e.g. Chain replacement"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Detailed notes..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <DollarSign className="inline h-4 w-4 mr-1" />Cost (SEK)
                  </label>
                  <input type="number" step="0.01" value={formData.cost}
                    onChange={e => setFormData({ ...formData, cost: e.target.value })}
                    placeholder="e.g. 500"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <User className="inline h-4 w-4 mr-1" />Performed By
                  </label>
                  <input type="text" value={formData.performedBy}
                    onChange={e => setFormData({ ...formData, performedBy: e.target.value })}
                    placeholder="e.g. Self, Bike Shop"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>
            ) : (
              /* ── Multi-row add form ── */
              <div className="space-y-3">
                {/* Column headers – hidden on very small screens, visible sm+ */}
                <div className="hidden sm:grid sm:grid-cols-[150px_110px_0.8fr_0.6fr_100px_130px_36px] gap-2 px-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <span>Date *</span>
                  <span>Dist. (km)</span>
                  <span>Service Type *</span>
                  <span>Description</span>
                  <span>Cost (SEK)</span>
                  <span>Performed By</span>
                  <span />
                </div>

                {rows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-[150px_110px_0.8fr_0.6fr_100px_130px_36px] gap-2 items-start bg-gray-50 sm:bg-transparent rounded-xl sm:rounded-none p-3 sm:p-0 border sm:border-0 border-gray-200">
                    {/* Mobile row label */}
                    <div className="flex items-center justify-between sm:hidden mb-1">
                      <span className="text-xs font-semibold text-gray-500">Row {idx + 1}</span>
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">Date *</label>
                      <input type="date" required value={row.serviceDate}
                        onChange={e => updateRow(idx, 'serviceDate', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">Distance (km)</label>
                      <input type="number" value={row.distanceAtService}
                        onChange={e => updateRow(idx, 'distanceAtService', e.target.value)}
                        placeholder="km"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">Service Type *</label>
                      <input type="text" required value={row.serviceType}
                        onChange={e => updateRow(idx, 'serviceType', e.target.value)}
                        placeholder="Chain, Brake pads…"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">Description</label>
                      <input type="text" value={row.description}
                        onChange={e => updateRow(idx, 'description', e.target.value)}
                        placeholder="Notes…"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">Cost (SEK)</label>
                      <input type="number" step="0.01" value={row.cost}
                        onChange={e => updateRow(idx, 'cost', e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">Performed By</label>
                      <input type="text" value={row.performedBy}
                        onChange={e => updateRow(idx, 'performedBy', e.target.value)}
                        placeholder="Self"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                    </div>

                    {/* Desktop delete button */}
                    <div className="hidden sm:flex items-center justify-center pt-0.5">
                      {rows.length > 1 ? (
                        <button type="button" onClick={() => removeRow(idx)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="w-9" />
                      )}
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addRow}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors text-sm font-medium border border-blue-200 border-dashed w-full justify-center">
                  <Plus className="h-4 w-4" />
                  Add Row
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 bg-white rounded-b-xl shrink-0">
            {!isEditMode && (
              <span className="text-xs text-gray-400">{rows.length} row{rows.length !== 1 ? 's' : ''} · each saved as a separate record</span>
            )}
            {isEditMode && <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium">
                {saving ? 'Saving…' : isEditMode ? 'Update Record' : `Save ${rows.length > 1 ? `${rows.length} Records` : 'Record'}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GearMaintenanceModal;
