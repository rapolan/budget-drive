import React from 'react';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { User, Edit } from 'lucide-react';

interface AuditColumnProps {
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const AuditColumn: React.FC<AuditColumnProps> = ({
  createdByName,
  updatedByName,
  createdAt,
  updatedAt,
}) => {
  // Convert to Date objects if they're strings
  const createdDate = new Date(createdAt);
  const updatedDate = new Date(updatedAt);

  // Hybrid date format: relative for < 7 days, absolute for >= 7 days
  const formatHybridDate = (date: Date): string => {
    const daysAgo = differenceInDays(new Date(), date);

    if (daysAgo < 7) {
      // Recent: show relative time ("2 days ago")
      return formatDistanceToNow(date, { addSuffix: true });
    } else {
      // Older: show absolute date ("Nov 28, 2025")
      return format(date, 'MMM d, yyyy');
    }
  };

  const createdTimeDisplay = formatHybridDate(createdDate);
  const updatedTimeDisplay = formatHybridDate(updatedDate);
  const hasBeenEdited = updatedDate.getTime() > createdDate.getTime() + 1000; // 1 second tolerance

  return (
    <div className="text-xs text-gray-600">
      {/* Created by */}
      <div className="flex items-center gap-1">
        <User className="h-3 w-3 flex-shrink-0" />
        <span className="font-medium">{createdByName || 'Unknown'}</span>
        <span className="text-gray-400">•</span>
        <span className="text-gray-500">{createdTimeDisplay}</span>
      </div>

      {/* Last edited by (only show if different from creator) */}
      {hasBeenEdited && updatedByName && (
        <div className="flex items-center gap-1 text-gray-500 mt-0.5">
          <Edit className="h-3 w-3 flex-shrink-0" />
          <span>{updatedByName}</span>
          <span className="text-gray-400">•</span>
          <span>{updatedTimeDisplay}</span>
        </div>
      )}
    </div>
  );
};
