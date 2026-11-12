import React from 'react';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  icon?: React.ReactNode;
  /** Rendered after the input, inside the same relative wrapper (e.g. a show/hide-password toggle). */
  trailing?: React.ReactNode;
  hint?: string;
}

/**
 * Shared glass-styled text input for the signup/login/onboarding surface
 * (the one place in the app with no AppLayout chrome, hence its own
 * translucent-card look rather than the plain white modal forms
 * elsewhere). Extracted here, rather than copy-pasted across Signup,
 * Login, and all five wizard steps, because every one of those needed
 * the identical label/input/icon/error markup.
 *
 * Token-driven throughout (bg-surface2/60, border-edge-strong, etc.) -
 * no hardcoded colors, so it already adapts to both themes and to a
 * tenant's brand primary color without any extra work here.
 */
export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ label, error, icon, trailing, hint, id, className = '', ...rest }, ref) => {
    const inputId = id || `glass-input-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
      <div>
        <label htmlFor={inputId} className="block text-sm font-medium text-tx-secondary mb-1.5">
          {label}
        </label>
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-tx-muted">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              block w-full h-11 rounded-xl border bg-surface2/60 backdrop-blur-sm
              text-tx-primary placeholder:text-tx-muted
              transition-all duration-150
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary focus:bg-surface2
              ${icon ? 'pl-11' : 'pl-4'}
              ${trailing ? 'pr-11' : 'pr-4'}
              ${error ? 'border-status-danger-border focus:ring-status-danger-border/50 focus:border-status-danger-border' : 'border-edge-strong/80'}
              ${className}
            `}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...rest}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
              {trailing}
            </div>
          )}
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-status-danger-text">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-tx-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

GlassInput.displayName = 'GlassInput';
