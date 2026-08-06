import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const ITEM_HEIGHT = 40;

const NumberPickerModal = ({ title, value, min, max, onSelect, onCancel, displayFormatter }) => {
  const listRef = useRef(null);
  const [selected, setSelected] = useState(Number(value) || min);
  useLockBodyScroll(true);

  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  useEffect(() => {
    if (!listRef.current) return;
    const padding = listRef.current.clientHeight / 2 - ITEM_HEIGHT / 2;
    listRef.current.style.paddingTop = `${padding}px`;
    listRef.current.style.paddingBottom = `${padding}px`;
    const start = Math.max(0, (Number(value) || min) - min);
    listRef.current.scrollTop = start * ITEM_HEIGHT;
    setSelected(Number(value) || min);
  }, [value, min, max]);

  const handleScroll = (e) => {
    const next = min + Math.round(e.target.scrollTop / ITEM_HEIGHT);
    setSelected(Math.max(min, Math.min(max, next)));
  };

  const handleItemClick = (v) => {
    setSelected(v);
    if (listRef.current) {
      listRef.current.scrollTo({ top: (v - min) * ITEM_HEIGHT, behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-11/12 sm:max-w-[280px] rounded-2xl p-2 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-blue-600">
              {displayFormatter ? displayFormatter(selected) : selected}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="p-1 hover:bg-gray-100 rounded-lg"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-32 overflow-y-auto snap-y snap-mandatory bg-gray-50 rounded-xl"
        >
          {values.map((v) => (
            <div
              key={v}
              onClick={() => handleItemClick(v)}
              className={`h-10 snap-center flex items-center justify-center text-lg cursor-pointer select-none ${
                v === selected ? 'text-blue-700 font-bold bg-blue-100' : 'text-gray-400'
              }`}
            >
              {v}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-1.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 font-medium text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSelect(selected)}
            className="flex-1 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default NumberPickerModal;
