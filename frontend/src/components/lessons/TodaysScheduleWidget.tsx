import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Clock, CheckCircle, Eye, Calendar } from 'lucide-react';
import type { Lesson } from '@/types';
import { useTenant } from '@/contexts/TenantContext';

// Advances a tenant-resolved "HH:MM" wall-clock reading by the real
// milliseconds elapsed since it was captured - never re-reads the
// browser's own clock (see docs/ARCHITECTURE.md §7). This is what lets the
// widget keep a smooth per-minute ticker between TenantContext's own
// 5-minute refreshes without ever falling back to new Date().
function advanceTime(hhmm: string, elapsedMs: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const totalMinutes = (h * 60 + m + Math.floor(elapsedMs / 60000)) % (24 * 60);
  const wrapped = totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

interface TodaysScheduleWidgetProps {
  lessons: Lesson[];
  onViewLesson: (lesson: Lesson) => void;
  onCompleteLesson: (id: string) => void;
  getStudentName: (id: string) => string;
  getInstructorName: (id: string) => string;
}

export const TodaysScheduleWidget: React.FC<TodaysScheduleWidgetProps> = ({
  lessons,
  onViewLesson,
  onCompleteLesson,
  getStudentName,
  getInstructorName,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('todaysScheduleWidgetCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const { tenantNow } = useTenant();

  // Re-anchors from tenantNow.currentTime (and the real elapsed ms since it
  // was captured) rather than ever reading the browser's own clock - ticks
  // every minute for display smoothness, but always re-anchors whenever
  // TenantContext's own periodic refresh delivers a fresh tenantNow.
  const [anchor, setAnchor] = useState(() => ({ time: tenantNow?.currentTime ?? '00:00', capturedAt: Date.now() }));
  useEffect(() => {
    if (tenantNow) setAnchor({ time: tenantNow.currentTime, capturedAt: Date.now() });
  }, [tenantNow]);

  const [currentTime, setCurrentTime] = useState(() => advanceTime(anchor.time, Date.now() - anchor.capturedAt));

  useEffect(() => {
    setCurrentTime(advanceTime(anchor.time, Date.now() - anchor.capturedAt));
    const interval = setInterval(() => {
      setCurrentTime(advanceTime(anchor.time, Date.now() - anchor.capturedAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [anchor]);

  // Save collapse state to localStorage
  useEffect(() => {
    localStorage.setItem('todaysScheduleWidgetCollapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Filter and sort today's scheduled lessons
  const scheduledLessons = lessons
    .filter(l => l.status === 'scheduled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const completedLessons = lessons.filter(l => l.status === 'completed');

  // Find current (in-progress) and next lessons. currentLessons is a list,
  // not a single lesson - .find() previously stopped at the first match,
  // so two lessons starting at the identical time (a realistic scenario:
  // two different instructors, each with their own student) had only the
  // first misclassify as "Now" while the second silently fell through to
  // the generic "Upcoming" list below with no in-progress indicator, even
  // though it had also already started.
  const currentLessons = scheduledLessons.filter(
    l => l.startTime <= currentTime && l.endTime > currentTime
  );
  const currentLessonIds = new Set(currentLessons.map(l => l.id));

  const nextLesson = scheduledLessons.find(l => l.startTime > currentTime);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Calculate time until next lesson
  const getTimeUntil = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const [currentHours, currentMinutes] = currentTime.split(':').map(Number);

    const lessonMinutes = hours * 60 + minutes;
    const nowMinutes = currentHours * 60 + currentMinutes;
    const diff = lessonMinutes - nowMinutes;

    if (diff <= 0) return 'Now';
    if (diff < 60) return `in ${diff}m`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  };

  // If no lessons today, show a compact message
  if (lessons.length === 0) {
    return (
      <div className="bg-surface2 border border-edge rounded-lg px-4 py-3 mb-4">
        <div className="flex items-center gap-2 text-tx-muted">
          <Calendar className="h-4 w-4" />
          <span className="text-sm">No lessons scheduled for today</span>
        </div>
      </div>
    );
  }

  // Denominator for the completion bar/badges: only lessons that can
  // actually become "completed" today - scheduled + already-completed.
  // lessons.length (the raw prop) also includes cancelled/no_show, which
  // can never be completed, so using it as the denominator made the bar
  // permanently short of 100% and undercounted "done" (e.g. "0/3" when
  // only 2 of today's 3 lessons were ever actionable - the 3rd was a
  // no-show). scheduledLessons/completedLessons are already computed
  // above from the same `lessons` prop.
  const totalLessons = scheduledLessons.length + completedLessons.length;
  const remainingLessons = scheduledLessons.length;

  return (
    <div className="bg-surface border border-edge rounded-lg shadow-sm mb-4 overflow-hidden">
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-3 flex items-center justify-between bg-status-info-bg hover:brightness-95 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <span className="font-semibold text-tx-primary">Today's Schedule</span>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-2 text-sm">
            {completedLessons.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-status-success-bg text-status-success-text font-medium">
                {completedLessons.length} done
              </span>
            )}
            {remainingLessons > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-status-info-bg text-status-info-text font-medium">
                {remainingLessons} remaining
              </span>
            )}
            {totalLessons > 0 && completedLessons.length === totalLessons && (
              <span className="px-2 py-0.5 rounded-full bg-green-500 text-white font-medium">
                All done! 🎉
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Current/Next lesson preview when collapsed */}
          {isCollapsed && (currentLessons.length > 0 || nextLesson) && (
            <div className="text-sm text-tx-secondary hidden sm:block">
              {currentLessons.length === 1 ? (
                <span className="text-primary font-medium">
                  Now: {getStudentName(currentLessons[0].studentId)}
                </span>
              ) : currentLessons.length > 1 ? (
                <span className="text-primary font-medium">
                  Now: {currentLessons.length} lessons in progress
                </span>
              ) : nextLesson ? (
                <span>
                  Next: {getStudentName(nextLesson.studentId)} {getTimeUntil(nextLesson.startTime)}
                </span>
              ) : null}
            </div>
          )}

          {isCollapsed ? (
            <ChevronDown className="h-5 w-5 text-tx-muted" />
          ) : (
            <ChevronUp className="h-5 w-5 text-tx-muted" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {!isCollapsed && (
        <div className="px-4 py-3 space-y-3">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-surface3 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all duration-500"
                style={{ width: `${(completedLessons.length / totalLessons) * 100}%` }}
              />
            </div>
            <span className="text-xs text-tx-muted whitespace-nowrap">
              {completedLessons.length}/{totalLessons} complete
            </span>
          </div>

          {/* Current lesson highlight(s) - one card per lesson currently in
              progress, not just the first (see currentLessons above for
              why this must be a list, not a single lesson). */}
          {currentLessons.map((lesson) => (
            <div key={lesson.id} className="bg-primary text-white rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Now</span>
                    <Clock className="h-3 w-3 text-blue-200" />
                  </div>
                  <p className="font-semibold">{getStudentName(lesson.studentId)}</p>
                  <p className="text-sm text-blue-100">
                    {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)} • {getInstructorName(lesson.instructorId)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onViewLesson(lesson); }}
                    className="p-2 rounded-lg bg-surface/20 hover:bg-surface/30 transition-colors"
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCompleteLesson(lesson.id); }}
                    className="p-2 rounded-lg bg-surface/20 hover:bg-surface/30 transition-colors"
                    title="Mark complete"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Next lesson highlight (only if nothing is currently in progress) */}
          {currentLessons.length === 0 && nextLesson && (
            <div className="bg-status-info-bg border border-status-info-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Next {getTimeUntil(nextLesson.startTime)}</span>
                  </div>
                  <p className="font-semibold text-tx-primary">{getStudentName(nextLesson.studentId)}</p>
                  <p className="text-sm text-primary">
                    {formatTime(nextLesson.startTime)} - {formatTime(nextLesson.endTime)} • {getInstructorName(nextLesson.instructorId)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onViewLesson(nextLesson); }}
                  className="p-2 rounded-lg bg-status-info-bg hover:brightness-95 text-status-info-text transition-colors"
                  title="View details"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Remaining lessons list. Gated on the POST-FILTER list, not
              scheduledLessons.length - a lesson already shown above as
              "Now" or "Next" still counts toward scheduledLessons, so
              that raw count can be > 0 while nothing is actually left
              to show here, which previously rendered an empty "Upcoming"
              header with nothing beneath it. */}
          {(() => {
            const upcomingLessons = scheduledLessons.filter(
              l => !currentLessonIds.has(l.id) && l.id !== nextLesson?.id
            );
            if (upcomingLessons.length === 0) return null;
            return (
              <div className="space-y-2">
                <p className="text-xs font-medium text-tx-muted uppercase tracking-wider">Upcoming</p>
                <div className="space-y-1">
                  {upcomingLessons.slice(0, 3).map(lesson => ( // Show max 3 more
                    <div
                      key={lesson.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface2 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-tx-muted" />
                        <div>
                          <span className="text-sm font-medium text-tx-primary">
                            {formatTime(lesson.startTime)}
                          </span>
                          <span className="text-sm text-tx-muted ml-2">
                            {getStudentName(lesson.studentId)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onViewLesson(lesson); }}
                          className="p-1.5 rounded hover:bg-surface3 text-tx-muted transition-colors"
                          title="View details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {upcomingLessons.length > 3 && (
                    <p className="text-xs text-tx-muted px-3">
                      +{upcomingLessons.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* All done message */}
          {completedLessons.length === totalLessons && (
            <div className="bg-status-success-bg border border-status-success-border rounded-lg p-3 text-center">
              <p className="text-status-success-text font-medium">🎉 All lessons completed for today!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
