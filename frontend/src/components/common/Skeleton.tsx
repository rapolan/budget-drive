import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}) => {
  const baseClasses = 'bg-gray-200';
  const animationClasses = animation === 'pulse' ? 'animate-pulse' : 'animate-shimmer';

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseClasses} ${animationClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
};

// Common skeleton patterns
export const TableRowSkeleton: React.FC = () => (
  <tr className="animate-pulse">
    <td className="px-6 py-4">
      <Skeleton width="100%" height={20} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width="80%" height={20} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width="60%" height={20} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width="50%" height={20} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width="70%" height={20} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width="40%" height={20} />
    </td>
  </tr>
);

export const CardSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow p-6 animate-pulse">
    <div className="flex items-center mb-4">
      <Skeleton variant="circular" width={48} height={48} />
      <div className="ml-4 flex-1">
        <Skeleton width="60%" height={16} className="mb-2" />
        <Skeleton width="40%" height={12} />
      </div>
    </div>
    <Skeleton width="100%" height={80} />
  </div>
);

export const StatCardSkeleton: React.FC = () => (
  <div className="overflow-hidden rounded-lg bg-white shadow animate-pulse">
    <div className="p-6">
      <div className="flex items-center">
        <Skeleton variant="rectangular" width={48} height={48} />
        <div className="ml-4 flex-1">
          <Skeleton width="50%" height={14} className="mb-2" />
          <Skeleton width="40%" height={24} />
        </div>
      </div>
      <div className="mt-4">
        <Skeleton width="60%" height={12} />
      </div>
    </div>
  </div>
);

export const FormFieldSkeleton: React.FC = () => (
  <div className="space-y-2 animate-pulse">
    <Skeleton width="30%" height={14} />
    <Skeleton width="100%" height={40} variant="rectangular" />
  </div>
);

export const AvatarSkeleton: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <Skeleton variant="circular" width={size} height={size} />
);

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6">
    {/* Header */}
    <div>
      <Skeleton width="200px" height={32} className="mb-2" />
      <Skeleton width="350px" height={16} />
    </div>

    {/* Stats Grid */}
    <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>

    {/* Quick Actions */}
    <div className="rounded-lg bg-white p-6 shadow animate-pulse">
      <Skeleton width="150px" height={20} className="mb-4" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <Skeleton variant="rectangular" width={40} height={40} />
              <div className="flex-1">
                <Skeleton width="80%" height={16} className="mb-2" />
                <Skeleton width="60%" height={12} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Recent Activity */}
    <div className="rounded-lg bg-white p-6 shadow animate-pulse">
      <Skeleton width="150px" height={20} className="mb-4" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
            <Skeleton variant="circular" width={20} height={20} />
            <div className="flex-1">
              <Skeleton width="40%" height={16} className="mb-2" />
              <Skeleton width="80%" height={14} className="mb-1" />
              <Skeleton width="30%" height={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 6
}) => (
  <div className="rounded-lg bg-white shadow">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {[...Array(columns)].map((_, i) => (
              <th key={i} className="px-6 py-3">
                <Skeleton width="80%" height={12} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {[...Array(rows)].map((_, i) => (
            <tr key={i} className="animate-pulse">
              {[...Array(columns)].map((_, j) => (
                <td key={j} className="px-6 py-4">
                  <Skeleton width={`${60 + Math.random() * 40}%`} height={16} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
