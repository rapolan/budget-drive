import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, UserX, XCircle, ClipboardCheck } from 'lucide-react';
import { dashboardApi, lessonsApi } from '@/api';
import type { ReviewQueueDay, ReviewQueueLesson } from '@/api/dashboard';
import { BackButton, Button, EmptyState, LoadingSpinner } from '@/components/common';
import { formatShortDate, format12Hour } from '@/utils/timeFormat';

/**
 * Lessons whose end time has passed but are still 'scheduled', grouped by
 * day, most overdue first. Every lesson previously stayed 'scheduled'
 * forever - this is the queue that closes them out.
 */
export const ReviewQueuePage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'review-queue'],
    queryFn: () => dashboardApi.getReviewQueue(),
  });

  const days: ReviewQueueDay[] = data?.data?.days || [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['lessons'] });
  };

  const completeMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.complete(id),
    onSuccess: invalidate,
  });
  const noShowMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.noShow(id),
    onSuccess: invalidate,
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.cancel(id),
    onSuccess: invalidate,
  });
  const completeAllMutation = useMutation({
    mutationFn: (date: string) => dashboardApi.completeAllInDay(date),
    onSuccess: invalidate,
  });

  const anyActionPending =
    completeMutation.isPending ||
    noShowMutation.isPending ||
    cancelMutation.isPending ||
    completeAllMutation.isPending;

  return (
    <div className="space-y-6">
      <BackButton to="/" />

      <div>
        <h1 className="text-xl font-semibold text-tx-primary">Review Queue</h1>
        <p className="mt-1 text-sm text-tx-muted">
          Past lessons that still need a status - mark each Completed, No-show, or Cancelled.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!isLoading && days.length === 0 && (
        <EmptyState
          icon={<ClipboardCheck className="h-10 w-10" />}
          title="Nothing to review"
          description="Every past lesson has been marked completed, no-show, or cancelled."
        />
      )}

      {!isLoading && days.length > 0 && (
        <div className="space-y-5">
          {days.map(day => (
            <ReviewQueueDayGroup
              key={day.date}
              day={day}
              disabled={anyActionPending}
              onComplete={id => completeMutation.mutate(id)}
              onNoShow={id => noShowMutation.mutate(id)}
              onCancel={id => cancelMutation.mutate(id)}
              onCompleteAll={date => completeAllMutation.mutate(date)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ReviewQueueDayGroupProps {
  day: ReviewQueueDay;
  disabled: boolean;
  onComplete: (id: string) => void;
  onNoShow: (id: string) => void;
  onCancel: (id: string) => void;
  onCompleteAll: (date: string) => void;
}

const ReviewQueueDayGroup: React.FC<ReviewQueueDayGroupProps> = ({
  day,
  disabled,
  onComplete,
  onNoShow,
  onCancel,
  onCompleteAll,
}) => {
  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        day.overdue ? 'border-status-warning-border bg-status-warning-bg' : 'border-edge bg-surface'
      }`}
    >
      <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-edge">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-tx-primary">{formatShortDate(day.date)}</h2>
          {day.overdue && (
            <span className="text-xs font-medium text-status-warning-text bg-status-warning-bg border border-status-warning-border px-2 py-0.5 rounded-full">
              Overdue &gt;24h
            </span>
          )}
          <span className="text-xs text-tx-muted">
            {day.lessons.length} lesson{day.lessons.length === 1 ? '' : 's'}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onCompleteAll(day.date)}
        >
          Mark all completed
        </Button>
      </div>

      <div className="divide-y divide-edge">
        {day.lessons.map(lesson => (
          <ReviewQueueRow
            key={lesson.id}
            lesson={lesson}
            disabled={disabled}
            onComplete={() => onComplete(lesson.id)}
            onNoShow={() => onNoShow(lesson.id)}
            onCancel={() => onCancel(lesson.id)}
          />
        ))}
      </div>
    </div>
  );
};

interface ReviewQueueRowProps {
  lesson: ReviewQueueLesson;
  disabled: boolean;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
}

const ReviewQueueRow: React.FC<ReviewQueueRowProps> = ({ lesson, disabled, onComplete, onNoShow, onCancel }) => {
  return (
    <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-tx-primary truncate">{lesson.studentName}</p>
        <p className="text-xs text-tx-muted truncate">
          {lesson.instructorName} - {format12Hour(lesson.startTime)}&ndash;{format12Hour(lesson.endTime)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button variant="secondary" size="sm" disabled={disabled} onClick={onComplete}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={onNoShow}>
          <UserX className="h-3.5 w-3.5" />
          No-show
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={onCancel}>
          <XCircle className="h-3.5 w-3.5" />
          Cancelled
        </Button>
      </div>
    </div>
  );
};
