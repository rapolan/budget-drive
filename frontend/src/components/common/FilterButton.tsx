import React from 'react';

interface FilterButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  count?: number;
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
}

const variantClasses = {
  default: {
    active: 'bg-tx-primary text-surface',
    inactive: 'bg-surface text-tx-secondary border-[var(--border-strong)] hover:bg-surface2',
  },
  secondary: {
    active: 'bg-purple-600 text-white',
    inactive: 'bg-surface text-purple-600 border-purple-300/50 hover:bg-purple-500/10',
  },
  success: {
    active: 'bg-green-600 text-white',
    inactive: 'bg-surface text-green-600 border-green-300/50 hover:bg-green-500/10',
  },
  warning: {
    active: 'bg-yellow-600 text-white',
    inactive: 'bg-surface text-yellow-600 border-yellow-300/50 hover:bg-yellow-500/10',
  },
  danger: {
    active: 'bg-red-600 text-white',
    inactive: 'bg-surface text-red-600 border-red-300/50 hover:bg-red-500/10',
  },
  info: {
    active: 'bg-primary text-white',
    inactive: 'bg-surface text-primary border-primary/30 hover:bg-primary/10',
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
      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
        isActive
          ? `${classes.active} focus:ring-${variant === 'default' ? 'gray' : variant === 'secondary' ? 'purple' : variant}-500`
          : `${classes.inactive} focus:ring-gray-400`
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
