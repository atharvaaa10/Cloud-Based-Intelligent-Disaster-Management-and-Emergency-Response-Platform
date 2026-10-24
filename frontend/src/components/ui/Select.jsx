import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(function Select(
  {
    id,
    label,
    hint,
    error,
    required = false,
    options = [],
    children,
    className = '',
    ...props
  },
  ref
) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hintId = hint && selectId ? `${selectId}-hint` : undefined;
  const errorId = error && selectId ? `${selectId}-error` : undefined;

  return (
    <div className={`ui-form-group ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={selectId} className="ui-label">
          {label} {required && <span className="ui-required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="ui-select-wrapper">
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className="ui-select"
          {...props}
        >
          {children ||
            options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
        </select>
        <ChevronDown className="ui-select-caret" size={16} strokeWidth={1.8} aria-hidden="true" />
      </div>
      {hint && !error && <div id={hintId} className="ui-hint">{hint}</div>}
      {error && <div id={errorId} className="ui-error" role="alert">{error}</div>}
    </div>
  );
});

export default Select;
