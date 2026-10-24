import { forwardRef } from 'react';

const Input = forwardRef(function Input(
  {
    id,
    label,
    hint,
    error,
    required = false,
    className = '',
    leftIcon: LeftIcon,
    rightSlot,
    ...props
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hintId = hint && inputId ? `${inputId}-hint` : undefined;
  const errorId = error && inputId ? `${inputId}-error` : undefined;

  return (
    <div className={`ui-form-group ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={inputId} className="ui-label">
          {label} {required && <span className="ui-required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="ui-input-wrapper">
        {LeftIcon && <LeftIcon className="ui-input-icon-left" size={16} strokeWidth={1.8} aria-hidden="true" />}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={`ui-input ${LeftIcon ? 'with-left-icon' : ''} ${rightSlot ? 'with-right-slot' : ''}`}
          {...props}
        />
        {rightSlot && <div className="ui-input-slot-right">{rightSlot}</div>}
      </div>
      {hint && !error && <div id={hintId} className="ui-hint">{hint}</div>}
      {error && <div id={errorId} className="ui-error" role="alert">{error}</div>}
    </div>
  );
});

export default Input;
