import React from 'react';
import type { StudentProgress } from '@/types';

interface StudentProgressBarProps {
  progress: StudentProgress | undefined;
}

// The single progress-rendering component for the Students list (Constraint
// B) - both the table view and the card view render this exact component
// with no per-view variation in label, color, or percentage visibility.
// It only reads fields already computed by computeStudentProgress
// (Constraint A) - it never derives a required-lesson count or a percent.
export const StudentProgressBar: React.FC<StudentProgressBarProps> = ({ progress }) => {
  const isNoLessonsBooked = progress?.track === 'lessons' && (progress.lessonsRequired ?? 0) === 0;

  const label = !progress
    ? '—'
    : progress.track === 'completed'
    ? 'Completed'
    : isNoLessonsBooked
    ? 'No lessons booked'
    : `${progress.lessonsCompleted ?? 0} / ${progress.lessonsRequired ?? 0} lessons`;

  const percent = progress?.percentComplete ?? 0;
  const barWidth = isNoLessonsBooked ? 0 : percent;
  const barColorClass = percent >= 100 ? 'bg-status-success-text' : 'bg-primary';

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium text-tx-primary">{label}</span>
        {!isNoLessonsBooked && progress && (
          <span className="text-tx-muted">{Math.round(percent)}%</span>
        )}
      </div>
      <div className="h-2 bg-surface3 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColorClass}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
};
