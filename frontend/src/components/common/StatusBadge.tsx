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

type Intent = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusIntent: Record<Status, Intent> = {
  // Student statuses
  active: 'success',
  inactive: 'neutral',
  enrolled: 'info',
  completed: 'success',
  dropped: 'danger',
  suspended: 'danger',
  permit_expired: 'warning',

  // Lesson statuses
  scheduled: 'info',
  cancelled: 'danger',
  no_show: 'warning',

  // Payment statuses
  pending: 'warning',
  confirmed: 'success',
  failed: 'danger',
  refunded: 'neutral',

  // Vehicle statuses
  maintenance: 'warning',
  retired: 'neutral',

  // Instructor statuses
  on_leave: 'warning',
  terminated: 'danger',
};

const intentClassName: Record<Intent, string> = {
  info: 'bg-status-info-bg text-status-info-text',
  success: 'bg-status-success-bg text-status-success-text',
  warning: 'bg-status-warning-bg text-status-warning-text',
  danger: 'bg-status-danger-bg text-status-danger-text',
  neutral: 'bg-surface2 text-tx-primary',
};

const statusLabel: Record<Status, string> = {
  active: 'Active',
  inactive: 'Inactive',
  enrolled: 'Enrolled',
  completed: 'Completed',
  dropped: 'Dropped',
  suspended: 'Suspended',
  permit_expired: 'Permit Expired',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  pending: 'Pending',
  confirmed: 'Confirmed',
  failed: 'Failed',
  refunded: 'Refunded',
  maintenance: 'Maintenance',
  retired: 'Retired',
  on_leave: 'On Leave',
  terminated: 'Terminated',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const intent = statusIntent[status];

  if (!intent) {
    console.warn(`Unknown status: ${status}`);
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-surface2 text-tx-primary ${className}`}>
        {status}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${intentClassName[intent]} ${className}`}>
      {statusLabel[status]}
    </span>
  );
};
