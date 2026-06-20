import { X, Save, Loader2 } from 'lucide-react';
import BasicProfileFields from './BasicProfileFields';
import SportSettingsFields from './SportSettingsFields';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const ProfileEditModal = ({
  isOpen,
  onClose,
  editForm,
  setEditForm,
  isSaving,
  onSave,
  availableActivityTypes,
  loadingActivityTypes,
  allSportSettings
}) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-none sm:max-w-4xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-t-xl">
        {/* Modal Header - Sticky */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sm:rounded-t-xl sticky top-0 bg-white z-10">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            {editForm.sportName ? `Edit ${editForm.sportName} Settings` : 'Edit Profile Settings'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Close"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Basic Profile Fields (only show when not editing specific sport) */}
          {!editForm.sportId && (
            <BasicProfileFields editForm={editForm} setEditForm={setEditForm} />
          )}

          {/* Sport-specific Fields (only show when editing specific sport) */}
          {editForm.sportId && (
            <SportSettingsFields
              editForm={editForm}
              setEditForm={setEditForm}
              availableActivityTypes={availableActivityTypes}
              loadingActivityTypes={loadingActivityTypes}
              allSportSettings={allSportSettings}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm sm:text-base"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm sm:text-base"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Saving...</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditModal;
