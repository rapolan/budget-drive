import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Lesson } from '@/types';

interface LessonsCalendarViewProps {
  lessons: Lesson[];
  onLessonClick: (lesson: Lesson) => void;
  getStudentName: (id: string) => string;
  getInstructorName: (id: string) => string;
}

export const LessonsCalendarView: React.FC<LessonsCalendarViewProps> = ({
  lessons,
  onLessonClick,
  getStudentName,
  getInstructorName,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());

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

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes}${ampm}`;
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
          const isTodayDate = isToday(calendarDay.date);

          return (
            <div
              key={idx}
              className={`min-h-[120px] bg-white p-2 ${
                !calendarDay.isCurrentMonth ? 'bg-gray-50' : ''
              }`}
            >
              <div
                className={`mb-1 text-sm font-medium ${
                  !calendarDay.isCurrentMonth
                    ? 'text-gray-400'
                    : isTodayDate
                    ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white'
                    : 'text-gray-900'
                }`}
              >
                {calendarDay.day}
              </div>
              <div className="space-y-1">
                {dayLessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    onClick={() => onLessonClick(lesson)}
                    className={`w-full rounded border px-2 py-1 text-left text-xs hover:opacity-80 ${getStatusColor(
                      lesson.status
                    )}`}
                  >
                    <div className="truncate font-medium">
                      {formatTime(lesson.startTime)} {getStudentName(lesson.studentId)}
                    </div>
                    <div className="truncate text-[10px]">
                      {getInstructorName(lesson.instructorId)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center">
          <div className="mr-2 h-3 w-3 rounded bg-blue-100 border border-blue-300"></div>
          <span>Scheduled</span>
        </div>
        <div className="flex items-center">
          <div className="mr-2 h-3 w-3 rounded bg-green-100 border border-green-300"></div>
          <span>Completed</span>
        </div>
        <div className="flex items-center">
          <div className="mr-2 h-3 w-3 rounded bg-red-100 border border-red-300"></div>
          <span>Cancelled</span>
        </div>
        <div className="flex items-center">
          <div className="mr-2 h-3 w-3 rounded bg-orange-100 border border-orange-300"></div>
          <span>No Show</span>
        </div>
      </div>
    </div>
  );
};
