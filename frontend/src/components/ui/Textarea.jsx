import { forwardRef } from 'react';

const Textarea = forwardRef(function Textarea(
  {
    id,
    label,
    hint,
    error,
    required = false,
    rows = 3,
    className = '',
    ...props
  },
  ref
) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hintId = hint && textareaId ? `${textareaId}-hint` : undefined;
  const errorId = error && textareaId ? `${textareaId}-error` : undefined;

  return (
    <div className={`ui-form-group ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={textareaId} className="ui-label">
          {label} {required && <span className="ui-required" aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={!!error}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className="ui-textarea"
        {...props}
      />
      {hint && !error && <div id={hintId} className="ui-hint">{hint}</div>}
      {error && <div id={errorId} className="ui-error" role="alert">{error}</div>}
    </div>
  );
});

export default Textarea;
