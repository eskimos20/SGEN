import { X } from 'lucide-react';
import { INTERVAL_TYPES } from '../../hooks/useWorkoutSteps';

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center";

const NumberInput = ({ label, sublabel, value, onChange, min = 0, max, placeholder }) => (
  <div className="flex-1">
    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
    <input
      type="number"
      value={value}
      onChange={onChange}
      className={inputCls}
      style={{ fontSize: '16px' }}
      min={min}
      max={max}
      placeholder={placeholder}
    />
    <span className="block text-center text-xs text-gray-400 mt-0.5">{sublabel || '\u00A0'}</span>
  </div>
);

const DurationInput = ({ label, totalSeconds, onChange }) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  const handleMins = (e) => {
    const m = Math.max(0, Math.min(99, parseInt(e.target.value) || 0));
    onChange(m * 60 + secs);
  };
  const handleSecs = (e) => {
    const s = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
    onChange(mins * 60 + s);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <input
            type="number"
            value={mins}
            onChange={handleMins}
            className={inputCls}
            style={{ fontSize: '16px' }}
            min="0"
            max="99"
          />
          <span className="block text-center text-xs text-gray-400 mt-0.5">min</span>
        </div>
        <span className="text-gray-500 font-bold text-lg mb-4">:</span>
        <div className="flex-1">
          <input
            type="number"
            value={String(secs).padStart(2, '0')}
            onChange={handleSecs}
            className={inputCls}
            style={{ fontSize: '16px' }}
            min="0"
            max="59"
          />
          <span className="block text-center text-xs text-gray-400 mt-0.5">sec</span>
        </div>
      </div>
    </div>
  );
};

const StepEditorModal = ({ editingStep, setEditingStep, onSave, onCancel, ftp = 0 }) => {
  if (!editingStep) return null;

  const intervalType = INTERVAL_TYPES.find(t => t.id === editingStep.type);
  const w = (pct) => ftp > 0 ? `${Math.round(pct / 100 * ftp)}w` : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-none sm:max-w-lg h-[80vh] sm:h-auto flex flex-col rounded-t-2xl sm:rounded-t-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 sm:rounded-t-2xl">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">
            Edit {intervalType?.name}
          </h3>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {editingStep.type === 'interval' ? (
            <>
              {/* Row 1: Repetitions (half width) */}
              <div className="flex gap-2">
                <NumberInput
                  label="Repetitions"
                  sublabel="reps"
                  value={editingStep.reps}
                  onChange={(e) => setEditingStep({...editingStep, reps: parseInt(e.target.value) || 1})}
                  min={1}
                />
                <div className="flex-1" />
              </div>

              {/* Row 2: Interval Duration */}
              <DurationInput
                label="Interval Duration"
                totalSeconds={editingStep.duration}
                onChange={(secs) => setEditingStep({ ...editingStep, duration: secs })}
              />

              {/* Row 3: Work Power */}
              <div className="flex gap-2">
                <NumberInput
                  label={<>Work Power {w(editingStep.power) && <span className="font-normal text-blue-600">({w(editingStep.power)})</span>}</>}
                  sublabel={ftp > 0 ? `${editingStep.power}% of ${ftp}w` : '% FTP'}
                  value={editingStep.power}
                  onChange={(e) => setEditingStep({...editingStep, power: parseInt(e.target.value) || 0})}
                  min={0}
                  max={200}
                  placeholder="% FTP"
                />
                <div className="flex-1" />
              </div>

              {/* Row 4: Rest Duration */}
              <DurationInput
                label="Rest Duration"
                totalSeconds={editingStep.restDuration}
                onChange={(secs) => setEditingStep({ ...editingStep, restDuration: secs })}
              />

              {/* Row 5: Rest Power */}
              <div className="flex gap-2">
                <NumberInput
                  label={<>Rest Power {w(editingStep.restPower) && <span className="font-normal text-blue-600">({w(editingStep.restPower)})</span>}</>}
                  sublabel={ftp > 0 ? `${editingStep.restPower}% of ${ftp}w` : '% FTP'}
                  value={editingStep.restPower}
                  onChange={(e) => setEditingStep({...editingStep, restPower: parseInt(e.target.value) || 0})}
                  min={0}
                  max={100}
                  placeholder="% FTP"
                />
                <div className="flex-1" />
              </div>
            </>
          ) : (
            <DurationInput
              label="Duration"
              totalSeconds={editingStep.duration}
              onChange={(secs) => setEditingStep({ ...editingStep, duration: secs })}
            />
          )}

          {intervalType?.isRamp ? (
            /* Row: Start Power + End Power side by side */
            <div className="flex gap-2">
              <NumberInput
                label={<>Start Power {w(editingStep.powerStart) && <span className="font-normal text-blue-600">({w(editingStep.powerStart)})</span>}</>}
                sublabel={ftp > 0 ? `${editingStep.powerStart}% of ${ftp}w` : '% FTP'}
                value={editingStep.powerStart}
                onChange={(e) => setEditingStep({...editingStep, powerStart: parseInt(e.target.value) || 0})}
                min={0}
                max={200}
                placeholder="% FTP"
              />
              <NumberInput
                label={<>End Power {w(editingStep.powerEnd) && <span className="font-normal text-blue-600">({w(editingStep.powerEnd)})</span>}</>}
                sublabel={ftp > 0 ? `${editingStep.powerEnd}% of ${ftp}w` : '% FTP'}
                value={editingStep.powerEnd}
                onChange={(e) => setEditingStep({...editingStep, powerEnd: parseInt(e.target.value) || 0})}
                min={0}
                max={200}
                placeholder="% FTP"
              />
            </div>
          ) : editingStep.type !== 'interval' && (
            <div className="flex gap-2">
              <NumberInput
                label={<>Power {w(editingStep.power) && <span className="font-normal text-blue-600">({w(editingStep.power)})</span>}</>}
                sublabel={ftp > 0 ? `${editingStep.power}% of ${ftp}w` : '% FTP'}
                value={editingStep.power}
                onChange={(e) => setEditingStep({...editingStep, power: parseInt(e.target.value) || 0})}
                min={0}
                max={200}
                placeholder="% FTP"
              />
              <div className="flex-1" />
            </div>
          )}
        </div>
        
        <div className="flex gap-2 sm:gap-3 border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
          <button
            onClick={onCancel}
            className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm sm:text-base"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default StepEditorModal;
