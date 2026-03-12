import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Clock, CheckCircle, Eye, Calendar } from 'lucide-react';
import type { Lesson } from '@/types';

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

  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Save collapse state to localStorage
  useEffect(() => {
    localStorage.setItem('todaysScheduleWidgetCollapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Filter and sort today's scheduled lessons
  const scheduledLessons = lessons
    .filter(l => l.status === 'scheduled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const completedLessons = lessons.filter(l => l.status === 'completed');

  // Find current and next lessons
  const currentLesson = scheduledLessons.find(
    l => l.startTime <= currentTime && l.endTime > currentTime
  );

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
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Calendar className="h-4 w-4" />
          <span className="text-sm">No lessons scheduled for today</span>
        </div>
      </div>
    );
  }

  const totalLessons = lessons.length;
  const remainingLessons = scheduledLessons.length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4 overflow-hidden">
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-gray-900">Today's Schedule</span>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-2 text-sm">
            {completedLessons.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                {completedLessons.length} done
              </span>
            )}
            {remainingLessons > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
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
          {isCollapsed && (currentLesson || nextLesson) && (
            <div className="text-sm text-gray-600 hidden sm:block">
              {currentLesson ? (
                <span className="text-blue-600 font-medium">
                  Now: {getStudentName(currentLesson.studentId)}
                </span>
              ) : nextLesson ? (
                <span>
                  Next: {getStudentName(nextLesson.studentId)} {getTimeUntil(nextLesson.startTime)}
                </span>
              ) : null}
            </div>
          )}

          {isCollapsed ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {!isCollapsed && (
        <div className="px-4 py-3 space-y-3">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all duration-500"
                style={{ width: `${(completedLessons.length / totalLessons) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {completedLessons.length}/{totalLessons} complete
            </span>
          </div>

          {/* Current lesson highlight */}
          {currentLesson && (
            <div className="bg-blue-500 text-white rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Now</span>
                    <Clock className="h-3 w-3 text-blue-200" />
                  </div>
                  <p className="font-semibold">{getStudentName(currentLesson.studentId)}</p>
                  <p className="text-sm text-blue-100">
                    {formatTime(currentLesson.startTime)} - {formatTime(currentLesson.endTime)} • {getInstructorName(currentLesson.instructorId)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onViewLesson(currentLesson); }}
                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCompleteLesson(currentLesson.id); }}
                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                    title="Mark complete"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Next lesson highlight (only if no current lesson) */}
          {!currentLesson && nextLesson && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Next {getTimeUntil(nextLesson.startTime)}</span>
                  </div>
                  <p className="font-semibold text-gray-900">{getStudentName(nextLesson.studentId)}</p>
                  <p className="text-sm text-blue-700">
                    {formatTime(nextLesson.startTime)} - {formatTime(nextLesson.endTime)} • {getInstructorName(nextLesson.instructorId)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onViewLesson(nextLesson); }}
                  className="p-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors"
                  title="View details"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Remaining lessons list */}
          {scheduledLessons.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Upcoming</p>
              <div className="space-y-1">
                {scheduledLessons
                  .filter(l => l.id !== currentLesson?.id && l.id !== nextLesson?.id)
                  .slice(0, 3) // Show max 3 more
                  .map(lesson => (
                    <div
                      key={lesson.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <div>
                          <span className="text-sm font-medium text-gray-900">
                            {formatTime(lesson.startTime)}
                          </span>
                          <span className="text-sm text-gray-500 ml-2">
                            {getStudentName(lesson.studentId)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onViewLesson(lesson); }}
                          className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
                          title="View details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                {scheduledLessons.filter(l => l.id !== currentLesson?.id && l.id !== nextLesson?.id).length > 3 && (
                  <p className="text-xs text-gray-400 px-3">
                    +{scheduledLessons.filter(l => l.id !== currentLesson?.id && l.id !== nextLesson?.id).length - 3} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* All done message */}
          {completedLessons.length === totalLessons && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-green-700 font-medium">🎉 All lessons completed for today!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
