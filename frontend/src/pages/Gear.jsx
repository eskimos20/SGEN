import { useState, useEffect } from 'react';
import api from '../api/axios';
import { Loader2, ExternalLink, Plus } from 'lucide-react';
import GearList from '../components/gear/GearList';
import GearFormModal from '../components/gear/GearFormModal';
import ConfirmDialog from '../components/modals/ConfirmDialog';

const Gear = () => {
  const [gear, setGear] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showGearForm, setShowGearForm] = useState(false);
  const [selectedGear, setSelectedGear] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, gearId: null });

  useEffect(() => {
    fetchGear();
  }, []);

  const fetchGear = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch active gear from Intervals.icu
      const gearResponse = await api.get('/statistics/gear');
      const activeGear = Array.isArray(gearResponse.data) ? gearResponse.data : [];
      
      // Fetch all maintenance records to find retired gear
      const maintenanceResponse = await api.get('/gear-maintenance');
      const allMaintenance = Array.isArray(maintenanceResponse.data) ? maintenanceResponse.data : [];
      setMaintenance(allMaintenance);
      
      // Find gear IDs that have maintenance but are not in active gear list
      const activeGearIds = new Set(activeGear.map(g => g.id));
      const retiredGearMap = new Map();
      
      allMaintenance.forEach(m => {
        if (!activeGearIds.has(m.gearId)) {
          if (!retiredGearMap.has(m.gearId)) {
            retiredGearMap.set(m.gearId, {
              id: m.gearId,
              name: m.gearName || 'Unknown Gear',
              retired: true,
              removedFromStrava: true,
              distance: 0,
              type: 'Equipment'
            });
          }
        }
      });
      
      // Combine active and retired gear
      const combinedGear = [...activeGear, ...Array.from(retiredGearMap.values())];
      setGear(combinedGear);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load gear data');
      setGear([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGear = () => {
    setSelectedGear(null);
    setShowGearForm(true);
  };

  const handleEditGear = (gearItem) => {
    setSelectedGear(gearItem);
    setShowGearForm(true);
  };

  const handleDeleteGear = async (gearId) => {
    setDeleteDialog({ isOpen: true, gearId });
  };

  const handleConfirmDelete = async () => {
    const gearId = deleteDialog.gearId;
    setDeleteDialog({ isOpen: false, gearId: null });

    try {
      await api.delete(`/statistics/gear/${gearId}`);
      await fetchGear(); // Refresh list
    } catch (err) {
      setError('Failed to delete gear');
    }
  };

  const handleGearSaved = async () => {
    await fetchGear(); // Refresh list after save
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl sm:shadow-sm p-3 sm:p-6 border-b sm:border border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gear & Equipment</h1>
          <p className="text-gray-600 mt-1">Track your cycling equipment and maintenance</p>
        </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="card-mobile">
        {/* Card action row */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-700">Your Gear</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddGear}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Gear
            </button>
            <a
              href="https://intervals.icu/settings/gear"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              title="Update gear from Strava on Intervals.icu"
            >
              <ExternalLink className="h-4 w-4" />
              Update
            </a>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-400 mb-3" />
            <p className="text-gray-500">Loading gear...</p>
          </div>
        ) : (
          <GearList 
            gear={gear}
            maintenance={maintenance}
            onEdit={handleEditGear}
            onDelete={handleDeleteGear}
          />
        )}
      </div>

      {/* Gear Form Modal */}
      <GearFormModal
        isOpen={showGearForm}
        onClose={() => setShowGearForm(false)}
        gearItem={selectedGear}
        onSaved={handleGearSaved}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete Gear"
        message="Are you sure you want to delete this gear? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialog({ isOpen: false, gearId: null })}
      />
      </div>
    </div>
  );
};

export default Gear;
