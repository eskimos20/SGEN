import { useState, useEffect } from 'react';
import { X, Calendar, Trash2, DollarSign, User, Wrench, AlertCircle, Edit } from 'lucide-react';
import api from '../../api/axios';
import GearMaintenanceModal from './GearMaintenanceModal';
import ConfirmDialog from '../modals/ConfirmDialog';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const GearMaintenanceHistory = ({ isOpen, onClose, gearItem }) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, id: null });

  useEffect(() => {
    if (isOpen && gearItem) {
      fetchMaintenance();
    }
  }, [isOpen, gearItem]);

  const fetchMaintenance = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/gear-maintenance/gear/${gearItem.id}`);
      setMaintenance(response.data);
    } catch (err) {
      setError('Failed to load maintenance history');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowEditModal(true);
  };

  const handleDelete = async (id) => {
    setDeleteDialog({ isOpen: true, id });
  };

  const handleConfirmDelete = async () => {
    const id = deleteDialog.id;
    setDeleteDialog({ isOpen: false, id: null });
    setDeleting(id);
    try {
      await api.delete(`/gear-maintenance/${id}`);
      setMaintenance(maintenance.filter(m => m.id !== id));
    } catch (err) {
      alert('Failed to delete maintenance record');
    } finally {
      setDeleting(null);
    }
  };

  const handleMaintenanceSaved = () => {
    fetchMaintenance(); // Refresh the list after edit
    setShowEditModal(false);
    setEditingRecord(null);
  };

  const formatDistance = (meters) => {
    if (!meters) return 'N/A';
    return `${Math.round(meters / 1000).toLocaleString()} km`;
  };

  const formatCost = (cost) => {
    if (!cost) return 'N/A';
    return `${cost.toFixed(2)} SEK`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-none sm:max-w-4xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-y-auto flex flex-col rounded-t-2xl sm:rounded-t-xl">
        {/* Header - Sticky on mobile */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10 sm:rounded-t-xl">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Maintenance History</h2>
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

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
              <p className="text-gray-500">Loading maintenance history...</p>
            </div>
          ) : maintenance.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No maintenance records found</p>
              <p className="text-sm text-gray-400 mt-1">Add your first maintenance record to track service history</p>
            </div>
          ) : (
            <div className="space-y-4">
              {maintenance.map((record) => (
                <div
                  key={record.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Service Type & Date */}
                      <div className="flex items-center gap-3 mb-3">
                        <Wrench className="h-5 w-5 text-blue-600" />
                        <div>
                          <h3 className="font-semibold text-gray-900">{record.serviceType}</h3>
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {record.serviceDate}
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      {record.description && (
                        <p className="text-sm text-gray-700 mb-3 pl-8">{record.description}</p>
                      )}

                      {/* Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-8 text-sm">
                        {record.distanceAtService && (
                          <div>
                            <span className="text-gray-500">Distance:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {formatDistance(record.distanceAtService)}
                            </span>
                          </div>
                        )}
                        {record.cost && (
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3 text-gray-500" />
                            <span className="text-gray-500">Cost:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {formatCost(record.cost)}
                            </span>
                          </div>
                        )}
                        {record.performedBy && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-gray-500" />
                            <span className="text-gray-500">By:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {record.performedBy}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Edit and Delete Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(record)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-xl transition-colors"
                        title="Edit maintenance record"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        disabled={deleting === record.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded-xl transition-colors disabled:opacity-50"
                        title="Delete maintenance record"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors text-sm sm:text-base"
          >
            Close
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      <GearMaintenanceModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingRecord(null);
        }}
        gearItem={gearItem}
        maintenanceRecord={editingRecord}
        onSaved={handleMaintenanceSaved}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="Delete Maintenance Record"
        message="Are you sure you want to delete this maintenance record? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialog({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default GearMaintenanceHistory;
