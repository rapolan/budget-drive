import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lessonsApi } from '@/api';

// Complete/No-show/Cancel - the same three status-transition mutations
// Dashboard.tsx, Lessons.tsx, and ReviewQueue.tsx each define inline.
// `allowCorrection` distinguishes a normal transition (never set from a
// 'scheduled' lesson's own action buttons) from the "Correct" affordance
// on an already-closed lesson, which re-picks a status and needs the
// backend's terminal-status guard bypassed.
export function useLessonStatusActions() {
  const queryClient = useQueryClient();

  // Invalidates every surface that reads lesson status - the Lessons page's
  // table, TodaysScheduleWidget wherever it's mounted (Dashboard, this
  // hook's own callers), and the review queue - not just one page's own
  // query key.
  const invalidateAllLessonQueries = () => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'lessons' ||
        query.queryKey[0] === 'instructor-lessons',
    });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'review-queue'] });
  };

  const completeLessonMutation = useMutation({
    mutationFn: ({ id, allowCorrection }: { id: string; allowCorrection?: boolean }) =>
      lessonsApi.complete(id, allowCorrection),
    onSuccess: invalidateAllLessonQueries,
  });

  const noShowLessonMutation = useMutation({
    mutationFn: ({ id, allowCorrection }: { id: string; allowCorrection?: boolean }) =>
      lessonsApi.noShow(id, allowCorrection),
    onSuccess: invalidateAllLessonQueries,
  });

  const cancelLessonMutation = useMutation({
    mutationFn: ({ id, allowCorrection }: { id: string; allowCorrection?: boolean }) =>
      lessonsApi.cancel(id, allowCorrection),
    onSuccess: invalidateAllLessonQueries,
  });

  const handleCompleteLesson = async (id: string, allowCorrection = false) => {
    if (window.confirm('Mark this lesson as completed?')) {
      await completeLessonMutation.mutateAsync({ id, allowCorrection });
    }
  };

  const handleNoShowLesson = async (id: string, allowCorrection = false) => {
    if (window.confirm('Mark this lesson as no-show? The student did not arrive for their scheduled lesson.')) {
      await noShowLessonMutation.mutateAsync({ id, allowCorrection });
    }
  };

  const handleCancelLesson = async (id: string, allowCorrection = false) => {
    if (window.confirm('Are you sure you want to cancel this lesson?')) {
      await cancelLessonMutation.mutateAsync({ id, allowCorrection });
    }
  };

  return {
    handleCompleteLesson,
    handleNoShowLesson,
    handleCancelLesson,
    isPending:
      completeLessonMutation.isPending ||
      noShowLessonMutation.isPending ||
      cancelLessonMutation.isPending,
  };
}
