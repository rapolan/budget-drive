import React from 'react';

interface FilterButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  count?: number;
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
}

// Each variant's focus ring is listed explicitly (not built from a template
// literal like `focus:ring-${variant}-500`) - Tailwind's static JIT scanner
// can only generate classes it can see written out in source, so a dynamic
// class name silently produces no CSS at all. This is the same fix Button
// (components/common/Button.tsx) applies via its own static variant map.
const variantClasses = {
  default: {
    active: 'bg-tx-primary text-surface focus-visible:ring-edge-strong',
    inactive: 'bg-surface text-tx-secondary border-edge-strong hover:bg-surface2 focus-visible:ring-edge-strong',
  },
  secondary: {
    active: 'bg-purple-600 text-white focus-visible:ring-purple-500',
    inactive: 'bg-surface text-purple-600 border-purple-300/50 hover:bg-purple-500/10 focus-visible:ring-purple-500',
  },
  success: {
    // Active bg uses a fixed Tailwind scale color (not --status-success-text-rgb)
    // because that variable is a light/pastel tone meant for text-on-dark-surface
    // in dark mode - as a background with white label text it was illegible.
    active: 'bg-green-600 text-white focus-visible:ring-green-500',
    inactive: 'bg-surface text-status-success-text border-status-success-border/50 hover:bg-status-success-text/10 focus-visible:ring-green-500',
  },
  warning: {
    active: 'bg-yellow-600 text-white focus-visible:ring-yellow-500',
    inactive: 'bg-surface text-status-warning-text border-status-warning-border/50 hover:bg-status-warning-text/10 focus-visible:ring-yellow-500',
  },
  danger: {
    active: 'bg-red-600 text-white focus-visible:ring-red-500',
    inactive: 'bg-surface text-status-danger-text border-status-danger-border/50 hover:bg-status-danger-text/10 focus-visible:ring-red-500',
  },
  info: {
    active: 'bg-primary text-white focus-visible:ring-primary',
    inactive: 'bg-surface text-primary border-primary/30 hover:bg-primary/10 focus-visible:ring-primary',
  },
};

export const FilterButton: React.FC<FilterButtonProps> = ({
  label,
  isActive,
  onClick,
  count,
  variant = 'default',
}) => {
  const classes = variantClasses[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
        isActive ? classes.active : classes.inactive
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
          isActive ? 'bg-surface/20' : 'bg-surface2'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
};
