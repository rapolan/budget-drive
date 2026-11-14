import React, { useState } from 'react';
import { Check } from 'lucide-react';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  icon?: React.ReactNode;
  /** Rendered after the input, inside the same relative wrapper (e.g. a show/hide-password toggle). Takes priority over the auto "valid" check mark when both would apply. */
  trailing?: React.ReactNode;
  hint?: string;
  /** Shows a small check icon once this is true and the field has a value - e.g. pass a simple format/required check from the caller. Omitted entirely when not provided (most fields don't need it). */
  valid?: boolean;
}

/**
 * Shared glass-styled text input for the signup/login/onboarding surface,
 * with a floating label (shrinks and rises into the border when the
 * field has focus or a value, placeholder-less by default - the label
 * itself doubles as the placeholder, Linear/Stripe/Clerk-style).
 *
 * Token-driven throughout (bg-surface2, border-edge-strong, text-primary
 * for the focus glow, etc.) - no hardcoded colors or new tokens, so it
 * already adapts to both themes and to a tenant's brand primary color.
 */
export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ label, error, icon, trailing, hint, valid, id, className = '', value, defaultValue, placeholder, onFocus, onBlur, ...rest }, ref) => {
    const inputId = id || `glass-input-${label.replace(/\s+/g, '-').toLowerCase()}`;
    const [focused, setFocused] = useState(false);
    const hasValue = Boolean(value ?? defaultValue ?? '') && String(value ?? defaultValue ?? '').length > 0;
    const floated = focused || hasValue;
    const showValid = valid && hasValue && !error && !trailing;

    return (
      <div>
        <div className="relative">
          {icon && (
            <div
              className={`absolute left-0 top-0 h-12 flex items-center pl-3.5 pointer-events-none transition-colors duration-150 ${
                focused ? 'text-primary' : 'text-tx-muted'
              }`}
            >
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            placeholder={floated ? placeholder : undefined}
            className={`
              peer block w-full h-12 rounded-[14px] border bg-surface2/70 dark:bg-white/5
              text-tx-primary placeholder:text-tx-muted
              transition-all duration-150
              pt-4 pb-1
              focus:outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgb(var(--color-primary-rgb)/0.18)]
              ${icon ? 'pl-11' : 'pl-4'}
              ${(trailing || showValid) ? 'pr-11' : 'pr-4'}
              ${error ? 'border-status-danger-border focus:border-status-danger-border focus:shadow-[0_0_0_4px_rgb(var(--status-danger-border-rgb)/0.18)]' : 'border-edge-strong/70'}
              ${className}
            `}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            {...rest}
          />
          <label
            htmlFor={inputId}
            className={`
              absolute left-0 top-0 h-12 flex items-center pointer-events-none
              transition-all duration-150 origin-left
              ${icon ? 'pl-11' : 'pl-4'}
              ${floated
                ? 'text-xs -translate-y-[13px] text-tx-secondary'
                : 'text-sm text-tx-muted'}
              ${floated && focused && !error ? 'text-primary' : ''}
              ${floated && error ? 'text-status-danger-text' : ''}
            `}
          >
            {label}
          </label>
          {trailing ? (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
              {trailing}
            </div>
          ) : showValid ? (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-status-success-text" aria-hidden="true">
              <Check className="h-4 w-4" />
            </div>
          ) : null}
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="mt-1.5 text-xs text-status-danger-text">
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
