import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

/**
 * MultiSelect dropdown with checkbox support
 * 
 * Props:
 *   options: [{ value, label }] or string[]
 *   selected: string[] (selected values)
 *   onChange: (values: string[]) => void
 *   placeholder?: string
 *   className?: string
 *   allLabel?: string  (text for "select all" option)
 */
export default function MultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = 'Selecionar...',
  className = '',
  allLabel = 'Todos',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  // Normalize options to { value, label }
  const normalizedOptions = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function toggleAll() {
    if (selected.length === normalizedOptions.length) {
      onChange([]);
    } else {
      onChange(normalizedOptions.map(o => o.value));
    }
  }

  function remove(value, e) {
    e.stopPropagation();
    onChange(selected.filter(v => v !== value));
  }

  const allSelected = selected.length === normalizedOptions.length && normalizedOptions.length > 0;
  const someSelected = selected.length > 0 && !allSelected;

  const displayLabels = selected.length === 0
    ? null
    : selected.length === normalizedOptions.length
    ? allLabel
    : selected.slice(0, 2).map(v => normalizedOptions.find(o => o.value === v)?.label || v).join(', ')
      + (selected.length > 2 ? ` +${selected.length - 2}` : '');

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`input flex items-center gap-2 text-left w-full min-w-[140px] pr-8 ${selected.length > 0 ? 'text-gray-800' : 'text-gray-400'}`}
      >
        <span className="flex-1 truncate text-sm">
          {displayLabels || placeholder}
        </span>
        <ChevronDown size={14} className={`text-gray-400 absolute right-2 top-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Clear button */}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onChange([]); }}
          className="absolute right-6 top-2.5 text-gray-400 hover:text-gray-600"
        >
          <X size={13} />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[200] top-full left-0 min-w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
          {/* Select all */}
          <button
            type="button"
            onClick={toggleAll}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-700"
          >
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              allSelected ? 'bg-primary-500 border-primary-500' : someSelected ? 'bg-primary-200 border-primary-400' : 'border-gray-300'
            }`}>
              {(allSelected || someSelected) && <Check size={10} className="text-white" strokeWidth={3} />}
            </div>
            <span>{allLabel}</span>
            <span className="ml-auto text-xs text-gray-400">{normalizedOptions.length}</span>
          </button>

          {/* Options */}
          {normalizedOptions.map(opt => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-primary-50 text-sm text-left ${isSelected ? 'bg-primary-50' : ''}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected ? 'bg-primary-500 border-primary-500' : 'border-gray-300'
                }`}>
                  {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                </div>
                <span className="flex-1 truncate text-gray-700">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
