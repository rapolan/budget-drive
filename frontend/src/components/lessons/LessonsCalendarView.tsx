import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Lesson, InstructorAvailability, Instructor } from '@/types';
import { DayDetailModal } from './DayDetailModal';

interface LessonsCalendarViewProps {
  lessons: Lesson[];
  availability: InstructorAvailability[] | Record<string, InstructorAvailability[]>;
  instructors: Instructor[];
  onLessonClick: (lesson: Lesson) => void;
  onAvailabilityClick?: (instructorId: string, date: Date, startTime: string, endTime: string) => void;
  getStudentName: (id: string) => string;
  getInstructorName: (id: string) => string;
}

export const LessonsCalendarView: React.FC<LessonsCalendarViewProps> = ({
  lessons,
  availability,
  instructors,
  onLessonClick,
  onAvailabilityClick,
  getStudentName,
  getInstructorName,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Get current month/year
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get lessons for a specific date
  const getLessonsForDate = (date: Date) => {
    return lessons.filter((lesson) => {
      const lessonDate = new Date(lesson.date);
      return (
        lessonDate.getDate() === date.getDate() &&
        lessonDate.getMonth() === date.getMonth() &&
        lessonDate.getFullYear() === date.getFullYear()
      );
    });
  };

  // Get availability slots for a specific date
  const getAvailabilityForDate = (date: Date) => {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const availabilitySlots: Array<{ instructorId: string; instructorName: string; startTime: string; endTime: string }> = [];

    // Handle both array and object formats
    if (Array.isArray(availability)) {
      // Backend returns flat array format
      availability.forEach((slot) => {
        if (slot.dayOfWeek === dayOfWeek && slot.isActive) {
          const instructor = instructors.find(i => i.id === slot.instructorId);
          if (instructor) {
            availabilitySlots.push({
              instructorId: slot.instructorId,
              instructorName: instructor.fullName,
              startTime: slot.startTime,
              endTime: slot.endTime,
            });
          }
        }
      });
    } else {
      // Object format (instructorId -> slots[])
      Object.entries(availability).forEach(([instructorId, slots]) => {
        const instructor = instructors.find(i => i.id === instructorId);
        if (!instructor) return;

        // Find slots that match this day of week and are active
        slots.forEach((slot) => {
          if (slot.dayOfWeek === dayOfWeek && slot.isActive) {
            availabilitySlots.push({
              instructorId,
              instructorName: instructor.fullName,
              startTime: slot.startTime,
              endTime: slot.endTime,
            });
          }
        });
      });
    }

    return availabilitySlots;
  };

  // Get unique instructors working on a specific day
  const getInstructorsForDay = (date: Date) => {
    const dayLessons = getLessonsForDate(date);
    const dayAvailability = getAvailabilityForDate(date);

    const instructorIds = new Set<string>();

    // Add instructors from lessons
    dayLessons.forEach(lesson => instructorIds.add(lesson.instructorId));

    // Add instructors from availability
    dayAvailability.forEach(slot => instructorIds.add(slot.instructorId));

    return Array.from(instructorIds)
      .map(id => instructors.find(i => i.id === id))
      .filter((instructor): instructor is Instructor => instructor !== undefined)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  };

  // Generate calendar days
  const calendarDays = [];

  // Previous month days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    calendarDays.push({
      day,
      date: new Date(currentYear, currentMonth - 1, day),
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push({
      day,
      date: new Date(currentYear, currentMonth, day),
      isCurrentMonth: true,
    });
  }

  // Next month days to fill the grid
  const remainingDays = 42 - calendarDays.length; // 6 rows * 7 days
  for (let day = 1; day <= remainingDays; day++) {
    calendarDays.push({
      day,
      date: new Date(currentYear, currentMonth + 1, day),
      isCurrentMonth: false,
    });
  }

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      {/* Calendar Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          {monthNames[currentMonth]} {currentYear}
        </h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={goToToday}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={previousMonth}
            className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={nextMonth}
            className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200">
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="bg-gray-50 py-2 text-center text-xs font-semibold uppercase text-gray-700"
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((calendarDay, idx) => {
          const dayLessons = getLessonsForDate(calendarDay.date);
          const dayInstructors = calendarDay.isCurrentMonth ? getInstructorsForDay(calendarDay.date) : [];
          const isTodayDate = isToday(calendarDay.date);
          const hasActivity = dayInstructors.length > 0;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => calendarDay.isCurrentMonth && hasActivity && setSelectedDate(calendarDay.date)}
              className={`min-h-[120px] bg-white p-2 text-left transition-colors ${
                !calendarDay.isCurrentMonth
                  ? 'bg-gray-50 cursor-default'
                  : hasActivity
                  ? 'hover:bg-blue-50 cursor-pointer'
                  : 'cursor-default'
              }`}
            >
              <div
                className={`mb-2 text-sm font-medium ${
                  !calendarDay.isCurrentMonth
                    ? 'text-gray-400'
                    : isTodayDate
                    ? 'flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white'
                    : 'text-gray-900'
                }`}
              >
                {calendarDay.day}
              </div>

              {hasActivity && (
                <div className="space-y-1">
                  {/* Show lesson count if any */}
                  {dayLessons.length > 0 && (
                    <div className="text-xs font-medium text-gray-700 mb-1">
                      {dayLessons.length} lesson{dayLessons.length !== 1 ? 's' : ''}
                    </div>
                  )}

                  {/* Show instructor names */}
                  {dayInstructors.map((instructor) => (
                    <div
                      key={instructor.id}
                      className="text-xs text-gray-600 truncate"
                    >
                      {instructor.fullName}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Help text */}
      <div className="mt-4 text-xs text-gray-500">
        Click on a day to view detailed schedule and book lessons
      </div>

      {/* Day Detail Modal */}
      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          lessons={getLessonsForDate(selectedDate)}
          availability={getAvailabilityForDate(selectedDate)}
          instructors={instructors}
          onClose={() => setSelectedDate(null)}
          onLessonClick={onLessonClick}
          onAvailabilityClick={onAvailabilityClick}
          getStudentName={getStudentName}
          getInstructorName={getInstructorName}
        />
      )}
    </div>
  );
};
