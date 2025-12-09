import React from 'react';
import { CheckCircle, Clock, XCircle, Calendar, MapPin } from 'lucide-react';
import type { Lesson, Instructor } from '@/types';
import { format12Hour, formatShortDate } from '@/utils/timeFormat';

interface LessonHistoryTimelineProps {
  lessons: Lesson[];
  instructors: Instructor[];
}

export const LessonHistoryTimeline: React.FC<LessonHistoryTimelineProps> = ({
  lessons,
  instructors,
}) => {
  // Sort lessons by date (most recent first)
  const sortedLessons = [...lessons].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const getInstructorName = (instructorId: string): string => {
    const instructor = instructors.find(i => i.id === instructorId);
    return instructor?.fullName || 'Unknown Instructor';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'scheduled':
        return <Clock className="h-5 w-5 text-blue-600" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Calendar className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'scheduled':
        return 'bg-blue-50 border-blue-200';
      case 'cancelled':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'scheduled':
        return 'Scheduled';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  if (sortedLessons.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No lessons scheduled yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedLessons.map((lesson, index) => (
        <div key={lesson.id} className="relative">
          {/* Timeline connector */}
          {index < sortedLessons.length - 1 && (
            <div
              className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200"
              style={{ transform: 'translateX(-50%)' }}
            />
          )}

          {/* Lesson Card */}
          <div className={`border rounded-lg p-4 ${getStatusColor(lesson.status)}`}>
            <div className="flex items-start gap-4">
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-1">
                {getStatusIcon(lesson.status)}
              </div>

              {/* Lesson Details */}
              <div className="flex-1 min-w-0">
                {/* Date and Time */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">
                      {formatShortDate(lesson.date)}
                    </h4>
                    <p className="text-xs text-gray-600">
                      {format12Hour(lesson.startTime)} - {format12Hour(lesson.endTime)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded ${
                      lesson.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : lesson.status === 'scheduled'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {getStatusLabel(lesson.status)}
                  </span>
                </div>

                {/* Lesson Type */}
                <div className="mb-2">
                  <span className="text-sm text-gray-700 capitalize">
                    {lesson.lessonType.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Instructor */}
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>{getInstructorName(lesson.instructorId)}</span>
                </div>

                {/* Pickup Location */}
                {lesson.pickupAddress && (
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="truncate">{lesson.pickupAddress}</span>
                  </div>
                )}

                {/* Notes if any */}
                {lesson.notes && (
                  <div className="mt-3 p-2 bg-white rounded border border-gray-200">
                    <p className="text-xs text-gray-600 italic">{lesson.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
