import React from 'react';

interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

/**
 * Select counterpart to GlassInput - same height/radius/border/focus-glow
 * treatment. Native <select> elements can't support a floating label the
 * same way an <input> can (no placeholder concept to float away from),
 * so this keeps a plain label above the control instead - still visually
 * consistent with GlassInput's floated state (same size/color/position
 * once an input has floated), just not animated.
 */
export const GlassSelect = React.forwardRef<HTMLSelectElement, GlassSelectProps>(
  ({ label, error, hint, id, className = '', children, ...rest }, ref) => {
    const selectId = id || `glass-select-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
      <div>
        <label htmlFor={selectId} className="block text-xs font-medium text-tx-secondary mb-1.5">
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={`
            block w-full h-12 px-4 rounded-[14px] border bg-surface2/70 dark:bg-white/5
            text-tx-primary
            transition-all duration-150
            focus:outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgb(var(--color-primary-rgb)/0.18)]
            ${error ? 'border-status-danger-border focus:border-status-danger-border' : 'border-edge-strong/70'}
            ${className}
          `}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          {...rest}
        >
          {children}
        </select>
        {error ? (
          <p id={`${selectId}-error`} className="mt-1.5 text-xs text-status-danger-text">
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
