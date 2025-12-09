import React from 'react';
import { X, Calendar as CalendarIcon, Clock, User } from 'lucide-react';
import type { Lesson, InstructorAvailability, Instructor } from '@/types';

interface DayDetailModalProps {
  date: Date;
  lessons: Lesson[];
  availability: Array<{ instructorId: string; instructorName: string; startTime: string; endTime: string }>;
  instructors: Instructor[];
  onClose: () => void;
  onLessonClick: (lesson: Lesson) => void;
  onAvailabilityClick?: (instructorId: string, date: Date, startTime: string, endTime: string) => void;
  getStudentName: (id: string) => string;
  getInstructorName: (id: string) => string;
  lessonDuration?: number; // in minutes, defaults to 120
  bufferTime?: number; // in minutes, defaults to 30
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  date,
  lessons,
  availability,
  instructors,
  onClose,
  onLessonClick,
  onAvailabilityClick,
  getStudentName,
  getInstructorName,
  lessonDuration = 120,
  bufferTime = 30,
}) => {
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'completed':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'cancelled':
        return 'bg-red-100 border-red-300 text-red-800';
      case 'no_show':
        return 'bg-orange-100 border-orange-300 text-orange-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Scheduled</span>;
      case 'completed':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">Completed</span>;
      case 'cancelled':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">Cancelled</span>;
      case 'no_show':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">No Show</span>;
      default:
        return null;
    }
  };

  // Helper to convert time string to minutes since midnight
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Helper to convert minutes since midnight to time string
  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  // Check if a time slot overlaps with any booked lesson (including buffer time)
  const isSlotBooked = (instructorId: string, slotStart: string, slotEnd: string): boolean => {
    const slotStartMin = timeToMinutes(slotStart);
    const slotEndMin = timeToMinutes(slotEnd);

    return lessons.some(lesson => {
      if (lesson.instructorId !== instructorId) return false;

      const lessonStartMin = timeToMinutes(lesson.startTime);
      const lessonEndMin = timeToMinutes(lesson.endTime);

      // Check for overlap including buffer time after the lesson
      // A slot conflicts if it starts before the lesson ends + buffer
      return (slotStartMin < lessonEndMin + bufferTime && slotEndMin > lessonStartMin);
    });
  };

  // Break down availability blocks into individual lesson slots
  const breakDownAvailabilityIntoSlots = (
    instructorId: string,
    startTime: string,
    endTime: string
  ): Array<{ startTime: string; endTime: string }> => {
    const slots: Array<{ startTime: string; endTime: string }> = [];
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    let currentStart = startMinutes;

    while (currentStart + lessonDuration <= endMinutes) {
      const currentEnd = currentStart + lessonDuration;
      const slotStart = minutesToTime(currentStart);
      const slotEnd = minutesToTime(currentEnd);

      // Only add slot if it's not already booked
      if (!isSlotBooked(instructorId, slotStart, slotEnd)) {
        slots.push({
          startTime: slotStart,
          endTime: slotEnd,
        });
      }

      // Move to next slot: lesson duration + buffer time
      currentStart = currentEnd + bufferTime;
    }

    return slots;
  };

  // Group lessons and availability by instructor
  const instructorSchedules = new Map<string, {
    instructor: Instructor;
    lessons: Lesson[];
    availableSlots: Array<{ startTime: string; endTime: string }>;
  }>();

  // Add lessons to schedule
  lessons.forEach(lesson => {
    const instructor = instructors.find(i => i.id === lesson.instructorId);
    if (!instructor) return;

    if (!instructorSchedules.has(lesson.instructorId)) {
      instructorSchedules.set(lesson.instructorId, {
        instructor,
        lessons: [],
        availableSlots: [],
      });
    }
    instructorSchedules.get(lesson.instructorId)!.lessons.push(lesson);
  });

  // Add availability to schedule - break down into individual lesson slots
  availability.forEach(slot => {
    const instructor = instructors.find(i => i.id === slot.instructorId);
    if (!instructor) return;

    if (!instructorSchedules.has(slot.instructorId)) {
      instructorSchedules.set(slot.instructorId, {
        instructor,
        lessons: [],
        availableSlots: [],
      });
    }

    // Break down the availability block into individual lesson slots
    const individualSlots = breakDownAvailabilityIntoSlots(
      slot.instructorId,
      slot.startTime,
      slot.endTime
    );

    instructorSchedules.get(slot.instructorId)!.availableSlots.push(...individualSlots);
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-blue-600" />
                {formatDate(date)}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} • {availability.length} available slot{availability.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {instructorSchedules.size === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p>No lessons or availability for this day</p>
            </div>
          ) : (
            Array.from(instructorSchedules.entries())
              .sort((a, b) => a[1].instructor.fullName.localeCompare(b[1].instructor.fullName))
              .map(([instructorId, schedule]) => (
              <div key={instructorId} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Instructor Header */}
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-600" />
                      <h3 className="font-semibold text-gray-900">{schedule.instructor.fullName}</h3>
                    </div>
                    <span className="text-sm text-gray-600">
                      {schedule.lessons.length} lesson{schedule.lessons.length !== 1 ? 's' : ''}
                      {schedule.availableSlots.length > 0 && ` • ${schedule.availableSlots.length} available`}
                    </span>
                  </div>
                </div>

                {/* Schedule Items */}
                <div className="divide-y divide-gray-100">
                  {/* Booked Lessons */}
                  {schedule.lessons
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => onLessonClick(lesson)}
                      className="w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <Clock className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900">
                                {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
                              </span>
                              {getStatusBadge(lesson.status)}
                            </div>
                            <p className="text-sm text-gray-600">
                              {getStudentName(lesson.studentId)}
                            </p>
                            {lesson.notes && (
                              <p className="text-xs text-gray-500 mt-1 truncate">{lesson.notes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}

                  {/* Available Slots */}
                  {schedule.availableSlots
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((slot, idx) => (
                    <button
                      key={`avail-${idx}`}
                      type="button"
                      onClick={() => onAvailabilityClick?.(instructorId, date, slot.startTime, slot.endTime)}
                      className="w-full px-4 py-3 hover:bg-blue-50 transition-colors text-left border-l-2 border-dashed border-blue-300"
                    >
                      <div className="flex items-start gap-3">
                        <Clock className="h-4 w-4 text-blue-400 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-700">
                              {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              Available
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            Click to book this time slot
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
