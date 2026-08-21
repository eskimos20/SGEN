import { Loader2, Search, Plus, X } from 'lucide-react';
import { getSportEmoji } from '../../utils/sportTypeUtils';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const formatActivityType = (type) => {
  if (!type) return '';
  return type.replace(/([A-Z])/g, ' $1').trim();
};

const AddSportModal = ({
  isOpen,
  onClose,
  availableActivityTypes,
  loadingActivityTypes,
  selectedTypes,
  addSportSearch,
  setAddSportSearch,
  isCreatingSport,
  onCreateSport,
  onToggleType
}) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  
  if (!isOpen) return null;

  const filteredActivityTypes = availableActivityTypes.filter(type => {
    if (!addSportSearch) return true;
    const search = addSportSearch.toLowerCase();
    return type.toLowerCase().includes(search) || formatActivityType(type).toLowerCase().includes(search);
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-none sm:max-w-2xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-t-xl">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sm:rounded-t-xl sticky top-0 bg-white z-10">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Add New Sport</h3>
          <button
            onClick={onClose}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Close"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={addSportSearch}
              onChange={(e) => setAddSportSearch(e.target.value)}
              placeholder="Search activity types..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
            />
          </div>

          {loadingActivityTypes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
              <span className="text-gray-600">Loading activity types...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredActivityTypes.map(type => {
                const isSelected = selectedTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => onToggleType(type)}
                    className={`px-3 py-2 text-sm rounded-lg border-2 transition-colors text-left ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <span className="mr-1.5">{getSportEmoji(type)}</span>
                    {formatActivityType(type)}
                  </button>
                );
              })}
            </div>
          )}

          {selectedTypes.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-900 mb-2">
                Selected types ({selectedTypes.length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedTypes.map(type => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                  >
                    <span>{getSportEmoji(type)}</span>
                    {formatActivityType(type)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm sm:text-base"
          >
            Cancel
          </button>
          <button
            onClick={onCreateSport}
            disabled={selectedTypes.length === 0 || isCreatingSport}
            className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm sm:text-base"
          >
            {isCreatingSport ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Creating...</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create Sport
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddSportModal;
