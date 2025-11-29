import React from 'react';

interface FilterButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  count?: number;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const variantClasses = {
  default: {
    active: 'bg-gray-700 text-white',
    inactive: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
  },
  success: {
    active: 'bg-green-600 text-white',
    inactive: 'bg-white text-green-700 border-green-300 hover:bg-green-50',
  },
  warning: {
    active: 'bg-yellow-600 text-white',
    inactive: 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50',
  },
  danger: {
    active: 'bg-red-600 text-white',
    inactive: 'bg-white text-red-700 border-red-300 hover:bg-red-50',
  },
  info: {
    active: 'bg-blue-600 text-white',
    inactive: 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50',
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
  const colorClass = isActive ? classes.active : classes.inactive;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${colorClass}`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
          isActive ? 'bg-white/20' : 'bg-gray-100'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
};
