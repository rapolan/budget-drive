import React from 'react';

type Status =
  | 'active'
  | 'inactive'
  | 'enrolled'
  | 'completed'
  | 'dropped'
  | 'suspended'
  | 'permit_expired'
  | 'scheduled'
  | 'cancelled'
  | 'no_show'
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'refunded'
  | 'maintenance'
  | 'retired'
  | 'on_leave'
  | 'terminated';

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  // Student statuses
  active: { label: 'Active', className: 'bg-green-100 text-green-800' },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-800' },
  enrolled: { label: 'Enrolled', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  dropped: { label: 'Dropped', className: 'bg-red-100 text-red-800' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-800' },
  permit_expired: { label: 'Permit Expired', className: 'bg-orange-100 text-orange-800' },

  // Lesson statuses
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-800' },
  no_show: { label: 'No Show', className: 'bg-orange-100 text-orange-800' },

  // Payment statuses
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
  refunded: { label: 'Refunded', className: 'bg-gray-100 text-gray-800' },

  // Vehicle statuses
  maintenance: { label: 'Maintenance', className: 'bg-yellow-100 text-yellow-800' },
  retired: { label: 'Retired', className: 'bg-gray-100 text-gray-800' },

  // Instructor statuses
  on_leave: { label: 'On Leave', className: 'bg-yellow-100 text-yellow-800' },
  terminated: { label: 'Terminated', className: 'bg-red-100 text-red-800' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = statusConfig[status];

  if (!config) {
    console.warn(`Unknown status: ${status}`);
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 ${className}`}>
        {status}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className} ${className}`}>
      {config.label}
    </span>
  );
};
