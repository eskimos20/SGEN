import { useState, useEffect } from 'react';
import NumberPickerModal from './NumberPickerModal';

const NumberInput = ({ label, sublabel, value, onChange, min = 0, max = 999, className, style, placeholder, pickerTitle, displayFormatter, wrapperClassName }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  const title = pickerTitle || label || sublabel || 'Select number';

  return (
    <div className={wrapperClassName || 'flex-1 min-w-0'}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      {isMobile ? (
        <>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`bg-white text-gray-900 font-semibold text-base ${className}`}
            style={style}
          >
            {value}
          </button>
          {sublabel && <span className="block text-center text-xs text-gray-400 mt-0.5">{sublabel}</span>}
          {isOpen && (
            <NumberPickerModal
              title={title}
              value={value}
              min={min}
              max={max}
              displayFormatter={displayFormatter}
              onSelect={(v) => { onChange({ target: { value: String(v) } }); setIsOpen(false); }}
              onCancel={() => setIsOpen(false)}
            />
          )}
        </>
      ) : (
        <>
          <input
            type="number"
            value={value}
            onChange={onChange}
            className={className}
            style={style}
            min={min}
            max={max}
            placeholder={placeholder}
          />
          {sublabel && <span className="block text-center text-xs text-gray-400 mt-0.5">{sublabel}</span>}
        </>
      )}
    </div>
  );
};

export default NumberInput;
