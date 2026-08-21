import { X } from 'lucide-react';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const ConfirmDialog = ({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  confirmStyle = 'primary', // 'primary' | 'danger'
  onConfirm, 
  onCancel 
}) => {
  // Lock background scroll when modal is open
  useLockBodyScroll(isOpen);
  
  if (!isOpen) return null;

  const confirmButtonClass = confirmStyle === 'danger'
    ? 'px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium'
    : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-0 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-none sm:max-w-md w-full mx-auto h-auto max-h-[85vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-t-2xl sm:rounded-t-xl">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 pr-2">{title}</h3>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          )}
        </div>
        <p className="text-gray-600 mb-6 whitespace-pre-line text-sm sm:text-base">{message}</p>
        <div className="flex flex-row gap-2 sm:gap-3 justify-end">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm sm:text-base"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`${confirmButtonClass} px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
