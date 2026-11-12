import React from 'react';

interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

/** Select counterpart to GlassInput - same visual treatment, same surface. */
export const GlassSelect = React.forwardRef<HTMLSelectElement, GlassSelectProps>(
  ({ label, error, hint, id, className = '', children, ...rest }, ref) => {
    const selectId = id || `glass-select-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
      <div>
        <label htmlFor={selectId} className="block text-sm font-medium text-tx-secondary mb-1.5">
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={`
            block w-full h-11 px-4 rounded-xl border bg-surface2/60 backdrop-blur-sm
            text-tx-primary
            transition-all duration-150
            focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary focus:bg-surface2
            ${error ? 'border-status-danger-border focus:ring-status-danger-border/50 focus:border-status-danger-border' : 'border-edge-strong/80'}
            ${className}
          `}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          {...rest}
        >
          {children}
        </select>
        {error ? (
          <p id={`${selectId}-error`} className="mt-1.5 text-sm text-status-danger-text">
            {error}
          </p>
        ) : hint ? (
          <p id={`${selectId}-hint`} className="mt-1.5 text-xs text-tx-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

GlassSelect.displayName = 'GlassSelect';
