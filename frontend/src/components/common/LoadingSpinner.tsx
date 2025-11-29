import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-12 w-12 border-2',
    lg: 'h-16 w-16 border-4',
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-blue-600 border-t-transparent`}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  );
};
