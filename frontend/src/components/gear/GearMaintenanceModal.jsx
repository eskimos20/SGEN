import { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, User, Wrench } from 'lucide-react';
import api from '../../api/axios';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const GearMaintenanceModal = ({ isOpen, onClose, gearItem, maintenanceRecord, onSaved }) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  const [formData, setFormData] = useState({
    serviceDate: new Date().toISOString().split('T')[0],
    distanceAtService: '',
    serviceType: '',
    description: '',
    cost: '',
    performedBy: 'Self'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && gearItem) {
      if (maintenanceRecord) {
        // Editing existing record
        setFormData({
          serviceDate: maintenanceRecord.serviceDate,
          distanceAtService: maintenanceRecord.distanceAtService ? Math.round(maintenanceRecord.distanceAtService / 1000) : '',
          serviceType: maintenanceRecord.serviceType || '',
          description: maintenanceRecord.description || '',
          cost: maintenanceRecord.cost || '',
          performedBy: maintenanceRecord.performedBy || 'Self'
        });
      } else {
        // Creating new record - pre-fill distance with current gear distance
        const currentDistance = gearItem.distance || gearItem.total_distance || 0;
        setFormData({
          serviceDate: new Date().toISOString().split('T')[0],
          distanceAtService: Math.round(currentDistance / 1000),
          serviceType: '',
          description: '',
          cost: '',
          performedBy: 'Self'
        });
      }
    }
  }, [isOpen, gearItem, maintenanceRecord]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const maintenanceData = {
        gearId: gearItem.id,
        gearName: gearItem.name,
        serviceDate: formData.serviceDate,
        distanceAtService: formData.distanceAtService ? parseInt(formData.distanceAtService) * 1000 : null, // Convert km to meters
        serviceType: formData.serviceType,
        description: formData.description,
        cost: formData.cost ? parseFloat(formData.cost) : null,
        performedBy: formData.performedBy
      };

      if (maintenanceRecord) {
        // Update existing record
        await api.put(`/gear-maintenance/${maintenanceRecord.id}`, maintenanceData);
      } else {
        // Create new record
        await api.post('/gear-maintenance', maintenanceData);
      }
      
      // Reset form
      setFormData({
        serviceDate: new Date().toISOString().split('T')[0],
        distanceAtService: '',
        serviceType: '',
        description: '',
        cost: '',
        performedBy: 'Self'
      });
      
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save maintenance record');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-none sm:max-w-4xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-y-auto flex flex-col rounded-t-2xl sm:rounded-t-xl">
        {/* Header - Sticky on mobile */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sm:rounded-t-xl sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              {maintenanceRecord ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">{gearItem?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Close"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Service Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline h-4 w-4 mr-1" />
              Service Date *
            </label>
            <input
              type="date"
              required
              value={formData.serviceDate}
              onChange={(e) => setFormData({ ...formData, serviceDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Distance at Service */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Distance at Service (km)
            </label>
            <input
              type="number"
              value={formData.distanceAtService}
              onChange={(e) => setFormData({ ...formData, distanceAtService: e.target.value })}
              placeholder="e.g., 5000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Current: {Math.round((gearItem?.distance || gearItem?.total_distance || 0) / 1000)} km</p>
          </div>

          {/* Service Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Wrench className="inline h-4 w-4 mr-1" />
              Service Type *
            </label>
            <input
              type="text"
              required
              value={formData.serviceType}
              onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
              placeholder="e.g., Chain replacement, Brake pads, Full service"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed notes about the service performed..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Cost */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <DollarSign className="inline h-4 w-4 mr-1" />
              Cost (SEK)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
              placeholder="e.g., 500"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Performed By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="inline h-4 w-4 mr-1" />
              Performed By
            </label>
            <input
              type="text"
              value={formData.performedBy}
              onChange={(e) => setFormData({ ...formData, performedBy: e.target.value })}
              placeholder="e.g., Self, Bike Shop Name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm sm:text-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
            >
              {saving ? 'Saving...' : (maintenanceRecord ? 'Update Maintenance' : 'Save Maintenance')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GearMaintenanceModal;
