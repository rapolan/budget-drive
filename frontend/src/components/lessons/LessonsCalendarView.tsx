import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, Clock, CheckCircle, TrendingUp } from 'lucide-react';
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

  // Calculate monthly stats
  const monthlyStats = useMemo(() => {
    const monthLessons = lessons.filter(lesson => {
      const lessonDate = new Date(lesson.date);
      return lessonDate.getMonth() === currentMonth && lessonDate.getFullYear() === currentYear;
    });
    
    const scheduledLessons = monthLessons.filter(l => l.status === 'scheduled').length;
    const completedLessons = monthLessons.filter(l => l.status === 'completed').length;
    const totalLessons = monthLessons.length;
    
    // Calculate total available slots for the month
    let totalAvailableSlots = 0;
    const availabilityArray = Array.isArray(availability) ? availability : Object.values(availability).flat();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dayOfWeek = date.getDay();
      const slotsForDay = availabilityArray.filter(
        (slot: InstructorAvailability) => slot.dayOfWeek === dayOfWeek && slot.isActive
      ).length;
      totalAvailableSlots += slotsForDay;
    }

    const bookedSlots = totalLessons;
    const openSlots = Math.max(0, totalAvailableSlots - bookedSlots);
    const utilizationRate = totalAvailableSlots > 0 
      ? Math.round((bookedSlots / totalAvailableSlots) * 100) 
      : 0;

    return {
      scheduledLessons,
      completedLessons,
      totalLessons,
      totalAvailableSlots,
      openSlots,
      utilizationRate
    };
  }, [lessons, availability, currentMonth, currentYear, daysInMonth]);

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
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-lg">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-900">{monthlyStats.totalLessons}</p>
              <p className="text-xs text-blue-600 font-medium">Lessons This Month</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500 rounded-lg">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-900">{monthlyStats.openSlots}</p>
              <p className="text-xs text-green-600 font-medium">Available Slots</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500 rounded-lg">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-900">{monthlyStats.completedLessons}</p>
              <p className="text-xs text-purple-600 font-medium">Completed</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 rounded-lg">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">{monthlyStats.utilizationRate}%</p>
              <p className="text-xs text-amber-600 font-medium">Utilization</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
        {/* Calendar Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Calendar className="h-4 w-4" />
              Today
            </button>
            <button
              onClick={previousMonth}
              className="rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={nextMonth}
              className="rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-px rounded-xl border border-gray-200 bg-gray-200 overflow-hidden">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
            const today = new Date();
            const isTodayColumn = today.getDay() === idx && 
              today.getMonth() === currentMonth && 
              today.getFullYear() === currentYear;
            
            return (
              <div
                key={day}
                className={`py-3 text-center text-xs font-semibold uppercase tracking-wider ${
                  isTodayColumn 
                    ? 'bg-gradient-to-b from-blue-100 to-blue-50 text-blue-900' 
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                {day}
              </div>
            );
          })}

        {/* Calendar days */}
        {calendarDays.map((calendarDay, idx) => {
          const dayLessons = getLessonsForDate(calendarDay.date);
          const dayInstructors = calendarDay.isCurrentMonth ? getInstructorsForDay(calendarDay.date) : [];
          const isTodayDate = isToday(calendarDay.date);
          const hasActivity = dayInstructors.length > 0;

          // Calculate availability for this day
          const dayAvailability = calendarDay.isCurrentMonth ? getAvailabilityForDate(calendarDay.date) : [];
          const totalSlots = dayAvailability.length;
          const scheduledCount = dayLessons.filter(l => l.status === 'scheduled').length;
          const availableSlots = totalSlots - scheduledCount;

          // Determine background color based on availability
          let bgColor = 'bg-white';
          let borderColor = '';
          if (hasActivity && calendarDay.isCurrentMonth) {
            if (totalSlots > 0) {
              if (availableSlots === 0) {
                bgColor = 'bg-red-50'; // Fully booked
                borderColor = 'border-l-2 border-red-400';
              } else if (availableSlots <= 2) {
                bgColor = 'bg-yellow-50'; // Limited availability
                borderColor = 'border-l-2 border-yellow-400';
              } else {
                bgColor = 'bg-green-50'; // Good availability
                borderColor = 'border-l-2 border-green-400';
              }
            }
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => calendarDay.isCurrentMonth && hasActivity && setSelectedDate(calendarDay.date)}
              className={`min-h-[110px] p-3 text-left transition-all duration-200 ${
                !calendarDay.isCurrentMonth
                  ? 'bg-gray-50/50 cursor-default opacity-40'
                  : isTodayDate
                  ? 'bg-gradient-to-b from-blue-50 to-blue-100/50'
                  : hasActivity
                  ? bgColor
                  : 'bg-white'
              } ${calendarDay.isCurrentMonth && hasActivity && !isTodayDate ? borderColor : ''} ${
                calendarDay.isCurrentMonth && hasActivity
                  ? 'hover:shadow-lg hover:scale-[1.02] cursor-pointer'
                  : 'cursor-default'
              }`}
            >
              {/* Today indicator bar */}
              {isTodayDate && (
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500"></div>
              )}
              
              {/* Day number */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`text-sm font-bold ${
                    !calendarDay.isCurrentMonth
                      ? 'text-gray-400'
                      : isTodayDate
                      ? 'flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md'
                      : 'text-gray-900'
                  }`}
                >
                  {calendarDay.day}
                </div>

                {/* Availability badge */}
                {hasActivity && calendarDay.isCurrentMonth && totalSlots > 0 && (
                  <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    availableSlots === 0
                      ? 'bg-gradient-to-r from-red-100 to-red-200 text-red-800'
                      : availableSlots <= 2
                      ? 'bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800'
                      : 'bg-gradient-to-r from-green-100 to-green-200 text-green-800'
                  }`}>
                    {availableSlots === 0 ? 'FULL' : `${availableSlots} open`}
                  </div>
                )}
                
                {/* Today badge */}
                {isTodayDate && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white animate-pulse">
                    TODAY
                  </span>
                )}
              </div>

              {/* Instructor names */}
              {hasActivity && calendarDay.isCurrentMonth && (
                <div className="space-y-1">
                  {dayInstructors.slice(0, 2).map((instructor) => {
                    const initials = instructor.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    return (
                      <div
                        key={instructor.id}
                        className="flex items-center gap-1.5"
                      >
                        <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600">
                          {initials}
                        </div>
                        <span className="text-[11px] text-gray-700 truncate font-medium">
                          {instructor.fullName.split(' ')[0]}
                        </span>
                      </div>
                    );
                  })}
                  {dayInstructors.length > 2 && (
                    <div className="text-[10px] text-gray-500 font-semibold pl-6">
                      +{dayInstructors.length - 2} more
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-8 text-sm text-gray-600 py-3 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-green-50 to-green-100 border-l-2 border-green-400"></div>
            <span className="font-medium">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border-l-2 border-amber-400"></div>
            <span className="font-medium">Limited</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-red-50 to-red-100 border-l-2 border-red-400"></div>
            <span className="font-medium">Full</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-b from-blue-100 to-blue-50 border-t-2 border-blue-500"></div>
            <span className="font-medium">Today</span>
          </div>
        </div>
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
