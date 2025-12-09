import React from 'react';

interface SkeletonProps {
  className?: string;
}

/**
 * Basic skeleton loader component
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      role="status"
      aria-label="Loading..."
    />
  );
};

/**
 * Skeleton for table rows
 */
export const TableRowSkeleton: React.FC<{ columns?: number }> = ({ columns = 6 }) => {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="px-6 py-4">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
};

/**
 * Skeleton for table with multiple rows
 */
export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 6,
}) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <TableRowSkeleton key={index} columns={columns} />
      ))}
    </>
  );
};

/**
 * Skeleton for card components
 */
export const CardSkeleton: React.FC = () => {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <Skeleton className="h-6 w-1/3 mb-4" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-5/6 mb-2" />
      <Skeleton className="h-4 w-4/6" />
    </div>
  );
};

/**
 * Skeleton for stat cards on dashboard
 */
export const StatCardSkeleton: React.FC = () => {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    </div>
  );
};

/**
 * Skeleton for list items
 */
export const ListItemSkeleton: React.FC = () => {
  return (
    <div className="flex items-center space-x-4 p-4 bg-white rounded-lg border border-gray-200">
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
};

/**
 * Skeleton for form inputs
 */
export const FormInputSkeleton: React.FC = () => {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
};

/**
 * Skeleton for page header
 */
export const PageHeaderSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div className="flex-1">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  );
};

/**
 * Skeleton for calendar/timeline view
 */
export const CalendarSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
};
