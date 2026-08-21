import { useState, useEffect } from 'react';
import { X, Bike, Footprints, Watch, Wrench, Check } from 'lucide-react';
import api from '../../api/axios';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const ActivityGearModal = ({ isOpen, onClose, activity, onUpdated }) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  const [gear, setGear] = useState([]);
  const [selectedGearId, setSelectedGearId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchGear();
      setSelectedGearId(activity?.gear_id || null);
    }
  }, [isOpen, activity]);

  const fetchGear = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/statistics/gear');
      // Filter out retired gear
      const activeGear = (response.data || []).filter(g => !g.retired);
      setGear(activeGear);
    } catch (err) {
      setError('Failed to load gear');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedGearId) {
      setError('Please select a gear');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.put(`/statistics/activity/${activity.id}/gear`, {
        gearId: selectedGearId
      });
      
      if (onUpdated) {
        onUpdated();
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update gear');
    } finally {
      setSaving(false);
    }
  };

  const getGearIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'bike':
        return <Bike className="h-5 w-5" />;
      case 'shoes':
        return <Footprints className="h-5 w-5" />;
      case 'watch':
        return <Watch className="h-5 w-5" />;
      default:
        return <Wrench className="h-5 w-5" />;
    }
  };

  const getGearTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'bike':
        return 'bg-blue-100 text-blue-700';
      case 'shoes':
        return 'bg-green-100 text-green-700';
      case 'watch':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-none sm:max-w-4xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-t-xl">
        {/* Header - Sticky */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sm:rounded-t-xl sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Select Gear</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">{activity?.name || 'Activity'}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Close"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading gear...</div>
          ) : gear.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No gear available. Add gear first.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {gear.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedGearId(item.id)}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    selectedGearId === item.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${getGearTypeColor(item.type)}`}>
                        {getGearIcon(item.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{item.name}</h4>
                        <p className="text-sm text-gray-500 capitalize">{item.type}</p>
                        {item.notes && (
                          <p className="text-xs text-gray-400 mt-1">{item.notes}</p>
                        )}
                      </div>
                    </div>
                    {selectedGearId === item.id && (
                      <Check className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {((item.distance || 0) / 1000).toFixed(0)} km
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm sm:text-base"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedGearId}
            className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActivityGearModal;
