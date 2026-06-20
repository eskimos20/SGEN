import { useState, useEffect } from 'react';
import { X, Bike, Footprints, Watch, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../api/axios';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const GearFormModal = ({ isOpen, onClose, gearItem, onSaved }) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Bike',
    brand: '',
    model: '',
    purchased: '',
    distance: 0,
    time: 0,
    activities: 0,
    retired: false,
    activity_filters: []
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showActivityFilters, setShowActivityFilters] = useState(false);

  const gearTypes = [
    { value: 'Bike', label: 'Bike', icon: Bike },
    { value: 'Shoes', label: 'Shoes', icon: Footprints },
    { value: 'Watch', label: 'Watch', icon: Watch },
    { value: 'Equipment', label: 'Equipment', icon: Wrench }
  ];

  useEffect(() => {
    if (isOpen && gearItem) {
      // Edit mode - populate form with existing gear data
      setFormData({
        name: gearItem.name || '',
        type: gearItem.type || 'Bike',
        notes: gearItem.notes || '',
        purchased: gearItem.purchased || '',
        distance: Math.round((gearItem.distance || 0) / 1000), // Convert meters to km
        time: gearItem.time || gearItem.moving_time || 0,
        activities: gearItem.activities || gearItem.activity_count || 0,
        retired: gearItem.retired ? true : false, // retired is a date string or null
        activity_filters: Array.isArray(gearItem.activity_filters) ? gearItem.activity_filters : []
      });
    } else if (isOpen) {
      // Create mode - reset form
      setFormData({
        name: '',
        type: 'Bike',
        notes: '',
        purchased: '',
        distance: 0,
        time: 0,
        activities: 0,
        retired: false,
        activity_filters: []
      });
    }
    setError('');
  }, [isOpen, gearItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const gearData = {
        name: formData.name,
        type: formData.type,
        notes: formData.notes || null,
        purchased: formData.purchased || null,
        distance: (parseInt(formData.distance) || 0) * 1000, // Convert km to meters
        time: parseInt(formData.time) || 0,
        activities: parseInt(formData.activities) || 0,
        retired: formData.retired ? new Date().toISOString().split('T')[0] : null,
        activity_filters: formData.activity_filters
      };

      if (gearItem) {
        // Update existing gear
        await api.put(`/statistics/gear/${gearItem.id}`, gearData);
      } else {
        // Create new gear
        await api.post('/statistics/gear', gearData);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save gear');
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
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">
            {gearItem ? 'Edit Gear' : 'Add New Gear'}
          </h2>
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

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Canyon Aeroad, Nike Pegasus"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gearTypes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: value })}
                  className={`flex flex-col items-center gap-2 p-3 border-2 rounded-lg transition-all ${
                    formData.type === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g., Canyon Aeroad CF SLX, Nike Pegasus 40, or any other details..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Purchase Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Purchase Date
            </label>
            <input
              type="date"
              value={formData.purchased}
              onChange={(e) => setFormData({ ...formData, purchased: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Activity Filters */}
          <div className="bg-blue-50 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowActivityFilters(!showActivityFilters)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900">Auto-assign to Activities</h3>
                {formData.activity_filters && formData.activity_filters.length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                    {formData.activity_filters.length}
                  </span>
                )}
              </div>
              {showActivityFilters ? (
                <ChevronUp className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-600" />
              )}
            </button>
            
            {showActivityFilters && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-sm text-gray-600">
                  Click to select activity types. This gear will be automatically assigned to matching activities.
                </p>
                
                <div className="flex flex-wrap gap-2">
              {[
                { value: 'Ride', label: 'Ride' },
                { value: 'MountainBikeRide', label: 'MTB' },
                { value: 'GravelRide', label: 'Gravel' },
                { value: 'EBikeRide', label: 'E-Bike' },
                { value: 'EMountainBikeRide', label: 'E-MTB' },
                { value: 'TrackRide', label: 'Track' },
                { value: 'VirtualRide', label: 'Virtual Ride' },
                { value: 'Run', label: 'Run' },
                { value: 'TrailRun', label: 'Trail Run' },
                { value: 'VirtualRun', label: 'Virtual Run' },
                { value: 'Swim', label: 'Swim' },
                { value: 'OpenWaterSwim', label: 'Open Water' },
                { value: 'Walk', label: 'Walk' },
                { value: 'Hike', label: 'Hike' },
                { value: 'WeightTraining', label: 'Weights' },
                { value: 'Crossfit', label: 'Crossfit' },
                { value: 'HighIntensityIntervalTraining', label: 'HIIT' },
                { value: 'Yoga', label: 'Yoga' },
                { value: 'Pilates', label: 'Pilates' },
                { value: 'Workout', label: 'Workout' },
                { value: 'AlpineSki', label: 'Alpine Ski' },
                { value: 'BackcountrySki', label: 'Backcountry' },
                { value: 'NordicSki', label: 'Nordic Ski' },
                { value: 'RollerSki', label: 'Roller Ski' },
                { value: 'VirtualSki', label: 'Virtual Ski' },
                { value: 'Rowing', label: 'Rowing' },
                { value: 'VirtualRow', label: 'Virtual Row' },
                { value: 'Kayaking', label: 'Kayaking' },
                { value: 'Canoeing', label: 'Canoeing' },
                { value: 'StandUpPaddling', label: 'SUP' },
                { value: 'Surfing', label: 'Surfing' },
                { value: 'Kitesurf', label: 'Kitesurf' },
                { value: 'Windsurf', label: 'Windsurf' },
                { value: 'Sail', label: 'Sail' },
                { value: 'WaterSport', label: 'Water Sport' },
                { value: 'Tennis', label: 'Tennis' },
                { value: 'TableTennis', label: 'Table Tennis' },
                { value: 'Badminton', label: 'Badminton' },
                { value: 'Squash', label: 'Squash' },
                { value: 'Padel', label: 'Padel' },
                { value: 'Pickleball', label: 'Pickleball' },
                { value: 'Racquetball', label: 'Racquetball' },
                { value: 'Golf', label: 'Golf' },
                { value: 'Hockey', label: 'Hockey' },
                { value: 'Soccer', label: 'Soccer' },
                { value: 'Rugby', label: 'Rugby' },
                { value: 'RockClimbing', label: 'Climbing' },
                { value: 'IceSkate', label: 'Ice Skate' },
                { value: 'InlineSkate', label: 'Inline Skate' },
                { value: 'Skateboard', label: 'Skateboard' },
                { value: 'Snowboard', label: 'Snowboard' },
                { value: 'Snowshoe', label: 'Snowshoe' },
                { value: 'Elliptical', label: 'Elliptical' },
                { value: 'StairStepper', label: 'Stair Stepper' },
                { value: 'Handcycle', label: 'Handcycle' },
                { value: 'Wheelchair', label: 'Wheelchair' },
                { value: 'Velomobile', label: 'Velomobile' },
                { value: 'Transition', label: 'Transition' },
                { value: 'Other', label: 'Other' }
              ].map(({ value, label }) => {
                // Check if this type is selected - value is an array in Intervals.icu format
                const isSelected = Array.isArray(formData.activity_filters) && 
                  formData.activity_filters.some(f => 
                    f.field_id === 'type' && 
                    (Array.isArray(f.value) ? f.value.includes(value) : f.value === value)
                  );
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      const otherFilters = Array.isArray(formData.activity_filters) 
                        ? formData.activity_filters.filter(f => 
                            f.field_id !== 'type' || 
                            !(Array.isArray(f.value) ? f.value.includes(value) : f.value === value)
                          )
                        : [];
                      
                      if (isSelected) {
                        // Remove this type
                        setFormData({ ...formData, activity_filters: otherFilters });
                      } else {
                        // Add this type - use Intervals.icu format with value as array
                        setFormData({ 
                          ...formData, 
                          activity_filters: [...otherFilters, {
                            field_id: 'type',
                            operator: null,
                            value: [value],  // Array format like Intervals.icu
                            not: false
                          }]
                        });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
                </div>
              </div>
            )}
          </div>

          {/* Initial Stats */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-gray-900">Initial Stats</h3>
            <p className="text-sm text-gray-600">
              Set the starting values if this gear already has some usage
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Distance (km)
                </label>
                <input
                  type="number"
                  value={formData.distance}
                  onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time
                </label>
                <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                  {(() => {
                    const totalSeconds = parseInt(formData.time) || 0;
                    const totalMinutes = Math.floor(totalSeconds / 60);
                    const weeks = Math.floor(totalMinutes / (60 * 24 * 7));
                    const days = Math.floor((totalMinutes % (60 * 24 * 7)) / (60 * 24));
                    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
                    const minutes = totalMinutes % 60;
                    
                    const parts = [];
                    if (weeks > 0) parts.push(`${weeks}w`);
                    if (days > 0) parts.push(`${days}d`);
                    if (hours > 0) parts.push(`${hours}h`);
                    if (minutes > 0) parts.push(`${minutes}m`);
                    
                    return parts.length > 0 ? parts.join(' ') : '0m';
                  })()}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activities
                </label>
                <input
                  type="number"
                  value={formData.activities}
                  onChange={(e) => setFormData({ ...formData, activities: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Retired Status */}
          {gearItem && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <input
                type="checkbox"
                id="retired"
                checked={formData.retired}
                onChange={(e) => setFormData({ ...formData, retired: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="retired" className="text-sm font-medium text-gray-900">
                Mark as retired (no longer in use)
              </label>
            </div>
          )}

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
              {saving ? 'Saving...' : gearItem ? 'Update Gear' : 'Create Gear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GearFormModal;
