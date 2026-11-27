import { useState } from 'react';
import { Trash2, CheckCircle } from 'lucide-react';
import ConfirmDialog from '../modals/ConfirmDialog';

/** Green "Connected" pill shown next to every card title. */
export const ConnectedBadge = () => (
  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
    <CheckCircle className="h-3 w-3" />
    Connected
  </span>
);

/** The shared On/Off switch — used by ConnectionCard and standalone toggles. */
export const ToggleSwitch = ({ enabled, busy = false, onToggle }) => (
  <button
    type="button"
    onClick={() => !busy && onToggle(!enabled)}
    disabled={busy}
    className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border-2 transition-colors ${
      enabled ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
    } ${busy ? 'opacity-60' : ''}`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
        enabled ? 'translate-x-5' : 'translate-x-0.5'
      }`}
    />
  </button>
);

/**
 * Shared shell for every connection card on Profile: header with icon +
 * title + optional badge + trash can (top right), an On/Off toggle, and
 * children rendered only while the connection is enabled.
 *
 * Off is a soft-disconnect — credentials stay in the DB and the fields
 * are simply hidden. The trash can is the destructive path and asks for
 * confirmation via the standard ConfirmDialog.
 */
const ConnectionCard = ({
  icon: Icon,
  iconColor = 'text-gray-600',
  title,
  badge = null,
  enabled,
  onToggle = null,        // async (on:boolean) => void — null hides the toggle
  toggleLabel,
  name,                   // used in the delete confirmation text
  onDelete = null,        // async () => void — null hides the trash can
  confirmMessage = null,  // overrides the default delete question
  description = null,     // short paragraph shown under the header
  children,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  const handleToggle = async (on) => {
    if (!onToggle || toggleBusy) return;
    setToggleBusy(true);
    try { await onToggle(on); } finally { setToggleBusy(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(); }
    finally { setDeleting(false); setConfirmOpen(false); }
  };

  return (
    <div className="bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`h-5 w-5 ${iconColor}`} />}
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {badge}
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete settings"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>

      {description && (
        <p className="text-sm text-gray-600 mb-4">{description}</p>
      )}

      {onToggle && (
        <div className="flex items-center gap-3 mb-4">
          <ToggleSwitch enabled={enabled} busy={toggleBusy} onToggle={handleToggle} />
          <span className="font-medium text-gray-900">{toggleLabel || `Enable ${title}`}</span>
        </div>
      )}

      {enabled && children}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete settings"
        message={confirmMessage || `Do you want to delete all settings for ${name} connection?`}
        confirmText="Yes"
        cancelText="No"
        confirmStyle="danger"
        onConfirm={handleDelete}
        onCancel={() => !deleting && setConfirmOpen(false)}
      />
    </div>
  );
};

export default ConnectionCard;
