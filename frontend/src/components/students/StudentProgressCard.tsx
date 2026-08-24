import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import type { Student, Lesson } from '@/types';
import { AchievementBadges } from './AchievementBadges';

interface StudentProgressCardProps {
  student: Student;
  lessons: Lesson[];
}

export const StudentProgressCard: React.FC<StudentProgressCardProps> = ({ student, lessons }) => {
  const progress = student.progress;

  // Lesson-count stats (Completed/Scheduled/Total) are an unconditional
  // all-lesson-types count, not track-gated progress math - kept local.
  const studentLessons = lessons.filter(l => l.studentId === student.id);
  const completedLessons = studentLessons.filter(l => l.status === 'completed').length;
  const totalLessons = studentLessons.length;
  const scheduledLessons = studentLessons.filter(l => l.status === 'scheduled').length;

  if (!progress) {
    return (
      <div className="bg-surface rounded-lg shadow-sm border border-edge p-6">
        <p className="text-sm text-tx-muted">Progress unavailable.</p>
      </div>
    );
  }

  const progressPercentage = progress.percentComplete;

  return (
    <div className="bg-surface rounded-lg shadow-sm border border-edge p-6 space-y-6">
      {progress.needsDateOfBirth && (
        <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-status-warning-text flex-shrink-0" />
          <span className="text-sm text-status-warning-text">
            Add a date of birth to determine this student's progress track.
          </span>
        </div>
      )}

      {/* Progress Overview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-tx-secondary">Training Progress</h3>
          <span className="text-sm font-semibold text-primary">
            {progress.track === 'hours'
              ? `${progress.lessonsCompleted ?? 0} / ${progress.lessonsRequired ?? 0} lessons`
              : progress.displayLabel}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-surface3 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progressPercentage >= 100
                ? 'bg-status-success-text'
                : progressPercentage >= 75
                ? 'bg-primary'
                : 'bg-status-warning-text'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {!(progress.track === 'lessons' && progress.lessonsBooked === 0) && (
          <div className="mt-1 text-xs text-tx-muted text-right">
            {progressPercentage.toFixed(1)}% Complete
          </div>
        )}
      </div>

      {/* Hours requirement (minors only) - the legally meaningful figure for
          California behind-the-wheel training, kept visible on the record
          even though the list above speaks in lessons. */}
      {progress.track === 'hours' && (
        <div className="bg-status-info-bg border border-status-info-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-status-info-text">Required Hours</span>
            <span className="text-sm font-semibold text-status-info-text">{progress.displayLabel}</span>
          </div>
          <p className="mt-1 text-xs text-tx-muted">
            California requires {progress.hoursRequired} behind-the-wheel hours for minors - this is the legally required figure.
          </p>
        </div>
      )}

      {/* Short-lesson mismatch: lesson durations vary, so a minor can hit
          their required lesson COUNT while still short of their required
          HOURS (e.g. three 90-minute lessons is 4.5 of 6 hours). Flag it
          clearly so nobody marks the program complete on the lesson count
          alone. */}
      {progress.track === 'hours' &&
        (progress.lessonsCompleted ?? 0) >= (progress.lessonsRequired ?? 0) &&
        (progress.hoursCompleted ?? 0) < (progress.hoursRequired ?? 0) && (
          <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-status-warning-text flex-shrink-0 mt-0.5" />
            <span className="text-sm text-status-warning-text">
              Lesson count met, but only {progress.hoursCompleted} of {progress.hoursRequired} required hours logged -
              do not mark this program complete yet.
            </span>
          </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 bg-status-success-bg rounded-lg">
          <div className="text-2xl font-bold text-status-success-text">{completedLessons}</div>
          <div className="text-xs text-status-success-text mt-1">Completed</div>
        </div>
        <div className="text-center p-3 bg-status-info-bg rounded-lg">
          <div className="text-2xl font-bold text-primary">{scheduledLessons}</div>
          <div className="text-xs text-primary mt-1">Scheduled</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-700">{totalLessons}</div>
          <div className="text-xs text-purple-600 mt-1">Total</div>
        </div>
      </div>

      {/* Achievement Badges - a rewards display, not a progress readout (no
          percentage here; see the Training Progress bar above for that).
          Same three badges regardless of track/age. */}
      <AchievementBadges lessonsCompleted={completedLessons} />

      {/* Next Lesson Indicator */}
      {scheduledLessons > 0 && (
        <div className="bg-status-info-bg border border-status-info-border rounded-lg p-3">
          <div className="flex items-center gap-2 text-status-info-text">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">
              {scheduledLessons} lesson{scheduledLessons > 1 ? 's' : ''} scheduled
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
