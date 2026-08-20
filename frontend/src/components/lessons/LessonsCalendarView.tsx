import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, Clock, CheckCircle, TrendingUp, Users } from 'lucide-react';
import type { Lesson, InstructorAvailability, Instructor } from '@/types';
import { DayDetailModal } from './DayDetailModal';
import { useTenant } from '@/contexts/TenantContext';
import { useSessionState } from '@/hooks/useSessionState';
import { parseLocalDate, formatLocalDate } from '@/utils/timeFormat';

const ALL_INSTRUCTORS = 'all';

interface LessonsCalendarViewProps {
  lessons: Lesson[];
  availability: InstructorAvailability[] | Record<string, InstructorAvailability[]>;
  instructors: Instructor[];
  onLessonClick: (lesson: Lesson) => void;
  onAvailabilityClick?: (instructorId: string, date: Date, startTime: string, endTime: string) => void;
  getStudentName: (id: string) => string;
  getInstructorName: (id: string) => string;
  searchTerm?: string;
}

export interface LessonsCalendarViewRef {
  goToPrevious: () => void;
  goToNext: () => void;
  goToToday: () => void;
}

export const LessonsCalendarView = forwardRef<LessonsCalendarViewRef, LessonsCalendarViewProps>(({
  lessons,
  availability,
  instructors,
  onLessonClick,
  onAvailabilityClick,
  getStudentName,
  getInstructorName,
  searchTerm = '',
}, ref) => {
  const { tenantNow } = useTenant();
  // Seeded from the tenant's own today once it's resolved; a fixed
  // placeholder (never the browser's own new Date()) for the brief window
  // before TenantContext's first fetch lands - this only affects which
  // month initially renders, not any correctness-bearing comparison below.
  const [currentDate, setCurrentDate] = useState(() =>
    tenantNow ? parseLocalDate(tenantNow.today) : new Date(0)
  );
  React.useEffect(() => {
    if (tenantNow) setCurrentDate(parseLocalDate(tenantNow.today));
    // Only re-seed once, on the first resolution - deliberately excludes
    // tenantNow from deps beyond this effect's initial run so navigating
    // months isn't reset every 5 minutes by TenantContext's own refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!tenantNow]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hoveredDay, setHoveredDay] = useState<{ date: Date; rect: DOMRect } | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  // Which instructor's schedule to show, or ALL_INSTRUCTORS - matches the
  // weekly view's existing instructor filter. Persisted for the session so
  // it survives navigating away and back (see useSessionState).
  const [selectedInstructorId, setSelectedInstructorId] = useSessionState<string>(
    'lessons-calendar-instructor-filter',
    ALL_INSTRUCTORS
  );

  // Get current month/year for navigation
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Navigation functions
  const previousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToToday = () => {
    if (tenantNow) setCurrentDate(parseLocalDate(tenantNow.today));
  };

  // Expose navigation methods via ref
  useImperativeHandle(ref, () => ({
    goToPrevious: previousMonth,
    goToNext: nextMonth,
    goToToday,
  }));

  // Instructor-filtered lessons/availability, used everywhere below instead
  // of the raw props - the raw props are still used for the filter picker
  // itself, which always lists every instructor regardless of the current
  // selection.
  const filteredLessons = useMemo(() => {
    if (selectedInstructorId === ALL_INSTRUCTORS) return lessons;
    return lessons.filter((lesson) => lesson.instructorId === selectedInstructorId);
  }, [lessons, selectedInstructorId]);

  const filteredAvailability = useMemo(() => {
    if (selectedInstructorId === ALL_INSTRUCTORS) return availability;
    if (Array.isArray(availability)) {
      return availability.filter((slot) => slot.instructorId === selectedInstructorId);
    }
    return Object.fromEntries(
      Object.entries(availability).filter(([instructorId]) => instructorId === selectedInstructorId)
    );
  }, [availability, selectedInstructorId]);

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Calculate monthly stats
  const monthlyStats = useMemo(() => {
    // lesson.date is a DATE-only value (no wall-clock time) - compare it as
    // a plain YYYY-MM-DD string prefix rather than round-tripping through
    // new Date().getMonth()/.getFullYear(), which UTC-shifts the calendar
    // day for roughly half of every browser timezone.
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthLessons = filteredLessons.filter(lesson => String(lesson.date).startsWith(monthPrefix));

    const scheduledLessons = monthLessons.filter(l => l.status === 'scheduled').length;
    const completedLessons = monthLessons.filter(l => l.status === 'completed').length;
    const totalLessons = monthLessons.length;

    // Calculate total available slots for the month
    let totalAvailableSlots = 0;
    const availabilityArray = Array.isArray(filteredAvailability) ? filteredAvailability : Object.values(filteredAvailability).flat();
    
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
  }, [filteredLessons, filteredAvailability, currentMonth, currentYear, daysInMonth]);

  // Get lessons for a specific date. `date` is a calendar-grid cell built
  // from local year/month/day numbers (never a browser-instant read), so
  // formatLocalDate on it is category-(a)-safe - the comparison itself is
  // then a plain string match against lesson.date's own DATE-only value,
  // never a Date-object round-trip.
  const getLessonsForDate = (date: Date) => {
    const dateStr = formatLocalDate(date);
    return filteredLessons.filter((lesson) => String(lesson.date).split('T')[0] === dateStr);
  };

  // Check if a lesson matches the search term
  const lessonMatchesSearch = (lesson: Lesson): boolean => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const studentName = getStudentName(lesson.studentId).toLowerCase();
    const instructorName = getInstructorName(lesson.instructorId).toLowerCase();
    return (
      studentName.includes(search) ||
      instructorName.includes(search) ||
      lesson.lessonType.toLowerCase().includes(search) ||
      lesson.status.toLowerCase().includes(search)
    );
  };

  // Get count of matching lessons for a date (for search highlighting)
  const getMatchingLessonsCount = (date: Date): number => {
    if (!searchTerm) return 0;
    const dayLessons = getLessonsForDate(date);
    return dayLessons.filter(lessonMatchesSearch).length;
  };

  // Get availability slots for a specific date
  const getAvailabilityForDate = (date: Date) => {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const availabilitySlots: Array<{ instructorId: string; instructorName: string; startTime: string; endTime: string }> = [];

    // Handle both array and object formats
    if (Array.isArray(filteredAvailability)) {
      // Backend returns flat array format
      filteredAvailability.forEach((slot) => {
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
      Object.entries(filteredAvailability).forEach(([instructorId, slots]) => {
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
    if (!tenantNow) return false;
    return formatLocalDate(date) === tenantNow.today;
  };

  // Hover handlers with delay
  const handleMouseEnter = (date: Date, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const timeout = setTimeout(() => {
      setHoveredDay({ date, rect });
    }, 200); // 200ms delay before showing tooltip
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setHoveredDay(null);
  };

  // Get hover tooltip data for a date
  const getHoverData = (date: Date) => {
    const dayLessons = getLessonsForDate(date);
    const dayAvailability = getAvailabilityForDate(date);
    const dayInstructors = getInstructorsForDay(date);

    const scheduled = dayLessons.filter(l => l.status === 'scheduled').length;
    const completed = dayLessons.filter(l => l.status === 'completed').length;
    const cancelled = dayLessons.filter(l => l.status === 'cancelled').length;
    const noShow = dayLessons.filter(l => l.status === 'no_show').length;
    const availableSlots = Math.max(0, dayAvailability.length - scheduled);

    return {
      total: dayLessons.length,
      scheduled,
      completed,
      cancelled,
      noShow,
      availableSlots,
      instructors: dayInstructors.slice(0, 3),
      moreInstructors: Math.max(0, dayInstructors.length - 3),
    };
  };

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-status-info-bg rounded-xl p-4 border border-status-info-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-status-info-text">{monthlyStats.totalLessons}</p>
              <p className="text-xs text-primary font-medium">Lessons This Month</p>
            </div>
          </div>
        </div>

        <div className="bg-status-success-bg rounded-xl p-4 border border-status-success-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-success-text rounded-lg">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-status-success-text">{monthlyStats.openSlots}</p>
              <p className="text-xs text-status-success-text font-medium">Available Slots</p>
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

        <div className="bg-status-warning-bg rounded-xl p-4 border border-status-warning-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-warning-text rounded-lg">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-status-warning-text">{monthlyStats.utilizationRate}%</p>
              <p className="text-xs text-status-warning-text font-medium">Utilization</p>
            </div>
          </div>
        </div>
      </div>

      {/* Instructor Filter - matches the weekly view's existing filter, so
          an admin can see one instructor's schedule at a time here too. */}
      {instructors.length > 0 && (
        <div className="flex items-center gap-2 bg-surface rounded-xl p-4 border border-edge shadow-sm flex-wrap">
          <Users className="h-4 w-4 text-tx-muted flex-shrink-0" />
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedInstructorId(ALL_INSTRUCTORS)}
              className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                selectedInstructorId === ALL_INSTRUCTORS
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-surface2 text-tx-secondary hover:bg-surface3'
              }`}
            >
              All Instructors
            </button>
            {instructors.map((inst) => {
              const instId = inst.id.toString();
              const isSelected = instId === selectedInstructorId;
              const initials = inst.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              const firstName = inst.fullName.split(' ')[0];

              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => setSelectedInstructorId(instId)}
                  title={inst.fullName}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-200 ${
                    isSelected
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-surface2 text-tx-secondary hover:bg-surface3'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-surface3 text-tx-secondary'
                  }`}>
                    {initials}
                  </div>
                  <span className="text-xs font-medium">{firstName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-surface p-6 shadow-sm border border-edge">
        {/* Calendar Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-tx-primary">
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className="flex items-center gap-1 rounded-lg border border-edge-strong px-3 py-2 text-sm font-medium text-tx-secondary hover:bg-surface2 transition-colors"
            >
              <Calendar className="h-4 w-4" />
              Today
            </button>
            <button
              onClick={previousMonth}
              className="rounded-lg border border-edge-strong p-2 text-tx-secondary hover:bg-surface2 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={nextMonth}
              className="rounded-lg border border-edge-strong p-2 text-tx-secondary hover:bg-surface2 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-px rounded-xl border border-edge bg-surface3 overflow-hidden">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
            // .getDay() here reads a Date built from tenantNow.today via
            // parseLocalDate - calendar-day-of-week for an already
            // tenant-resolved string, not a browser-instant read.
            const tenantToday = tenantNow ? parseLocalDate(tenantNow.today) : null;
            const isTodayColumn = !!tenantToday && tenantToday.getDay() === idx &&
              tenantToday.getMonth() === currentMonth &&
              tenantToday.getFullYear() === currentYear;

            return (
              <div
                key={day}
                className={`py-3 text-center text-xs font-semibold uppercase tracking-wider ${
                  isTodayColumn
                    ? 'bg-status-info-bg text-status-info-text'
                    : 'bg-surface2 text-tx-secondary'
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

          // Search highlighting
          const matchingCount = calendarDay.isCurrentMonth ? getMatchingLessonsCount(calendarDay.date) : 0;
          const hasSearchMatches = searchTerm && matchingCount > 0;
          const noSearchMatches = searchTerm && dayLessons.length > 0 && matchingCount === 0;

          // Determine background color based on availability
          let bgColor = 'bg-surface';
          let borderColor = '';
          if (hasActivity && calendarDay.isCurrentMonth) {
            if (totalSlots > 0) {
              if (availableSlots === 0) {
                bgColor = 'bg-status-danger-bg'; // Fully booked
                borderColor = 'border-l-2 border-status-danger-border';
              } else if (availableSlots <= 2) {
                bgColor = 'bg-status-warning-bg'; // Limited availability
                borderColor = 'border-l-2 border-status-warning-border';
              } else {
                bgColor = 'bg-status-success-bg'; // Good availability
                borderColor = 'border-l-2 border-status-success-border';
              }
            }
          }

          // Search match highlighting overrides
          const searchHighlight = hasSearchMatches ? 'ring-2 ring-amber-400 ring-offset-1' : '';
          const searchDim = noSearchMatches ? 'opacity-50' : '';

          return (
            <button
              key={idx}
              type="button"
              onClick={() => calendarDay.isCurrentMonth && hasActivity && setSelectedDate(calendarDay.date)}
              onMouseEnter={(e) => calendarDay.isCurrentMonth && hasActivity && handleMouseEnter(calendarDay.date, e)}
              onMouseLeave={handleMouseLeave}
              className={`min-h-[110px] p-3 text-left transition-all duration-200 relative ${
                !calendarDay.isCurrentMonth
                  ? 'bg-surface2/50 cursor-default opacity-40'
                  : isTodayDate
                  ? 'bg-status-info-bg'
                  : hasActivity
                  ? bgColor
                  : 'bg-surface'
              } ${calendarDay.isCurrentMonth && hasActivity && !isTodayDate ? borderColor : ''} ${
                calendarDay.isCurrentMonth && hasActivity
                  ? 'hover:shadow-lg hover:scale-[1.02] cursor-pointer'
                  : 'cursor-default'
              } ${searchHighlight} ${searchDim}`}
            >
              {/* Today indicator bar */}
              {isTodayDate && (
                <div className="absolute inset-x-0 top-0 h-1 bg-primary"></div>
              )}

              {/* Day number */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`text-sm font-bold ${
                    !calendarDay.isCurrentMonth
                      ? 'text-tx-muted'
                      : isTodayDate
                      ? 'flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-md'
                      : 'text-tx-primary'
                  }`}
                >
                  {calendarDay.day}
                </div>

                {/* Availability badge */}
                {hasActivity && calendarDay.isCurrentMonth && totalSlots > 0 && (
                  <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    availableSlots === 0
                      ? 'bg-status-danger-bg text-status-danger-text'
                      : availableSlots <= 2
                      ? 'bg-status-warning-bg text-status-warning-text'
                      : 'bg-status-success-bg text-status-success-text'
                  }`}>
                    {availableSlots === 0 ? 'FULL' : `${availableSlots} open`}
                  </div>
                )}

                {/* Today badge */}
                {isTodayDate && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-white animate-pulse">
                    TODAY
                  </span>
                )}

                {/* Search match badge */}
                {hasSearchMatches && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-status-warning-text text-white">
                    {matchingCount} match{matchingCount > 1 ? 'es' : ''}
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
                        <div className="w-5 h-5 rounded-full bg-surface3 flex items-center justify-center text-[9px] font-bold text-tx-secondary">
                          {initials}
                        </div>
                        <span className="text-[11px] text-tx-secondary truncate font-medium">
                          {instructor.fullName.split(' ')[0]}
                        </span>
                      </div>
                    );
                  })}
                  {dayInstructors.length > 2 && (
                    <div className="text-[10px] text-tx-muted font-semibold pl-6">
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
        <div className="mt-4 flex items-center justify-center gap-8 text-sm text-tx-secondary py-3 bg-surface2 rounded-xl border border-edge">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-status-success-bg border-l-2 border-status-success-border"></div>
            <span className="font-medium">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-status-warning-bg border-l-2 border-status-warning-border"></div>
            <span className="font-medium">Limited</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-status-danger-bg border-l-2 border-status-danger-border"></div>
            <span className="font-medium">Full</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-status-info-bg border-t-2 border-primary"></div>
            <span className="font-medium">Today</span>
          </div>
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredDay && (() => {
        const data = getHoverData(hoveredDay.date);
        const tooltipWidth = 220;
        const tooltipHeight = 180;

        // Calculate position - show below by default, above if near bottom
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - hoveredDay.rect.bottom;
        const showAbove = spaceBelow < tooltipHeight + 20;

        // Center horizontally relative to the cell
        let left = hoveredDay.rect.left + (hoveredDay.rect.width / 2) - (tooltipWidth / 2);
        // Keep tooltip on screen
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));

        const top = showAbove
          ? hoveredDay.rect.top - tooltipHeight - 8
          : hoveredDay.rect.bottom + 8;

        return (
          <div
            className="fixed z-50 bg-surface rounded-xl shadow-xl border border-edge p-4 pointer-events-none"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${tooltipWidth}px`,
            }}
          >
            {/* Date header */}
            <div className="text-sm font-bold text-tx-primary mb-3 pb-2 border-b border-edge">
              {hoveredDay.date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}
            </div>

            {/* Lesson stats */}
            {data.total > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-1.5">Lessons</p>
                <div className="flex flex-wrap gap-2">
                  {data.scheduled > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-status-info-bg text-primary font-medium">
                      {data.scheduled} scheduled
                    </span>
                  )}
                  {data.completed > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-status-success-bg text-status-success-text font-medium">
                      {data.completed} completed
                    </span>
                  )}
                  {data.cancelled > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-status-danger-bg text-status-danger-text font-medium">
                      {data.cancelled} cancelled
                    </span>
                  )}
                  {data.noShow > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning-text font-medium">
                      {data.noShow} no-show
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Available slots */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-1">Availability</p>
              <span className={`text-sm font-bold ${
                data.availableSlots === 0 ? 'text-status-danger-text' :
                data.availableSlots <= 2 ? 'text-status-warning-text' : 'text-status-success-text'
              }`}>
                {data.availableSlots === 0 ? 'Fully booked' : `${data.availableSlots} open slot${data.availableSlots > 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Instructors */}
            {data.instructors.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-1">Instructors</p>
                <div className="flex flex-wrap gap-1">
                  {data.instructors.map(instructor => (
                    <span key={instructor.id} className="text-xs text-tx-secondary">
                      {instructor.fullName.split(' ')[0]}
                    </span>
                  ))}
                  {data.moreInstructors > 0 && (
                    <span className="text-xs text-tx-muted">+{data.moreInstructors} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Click hint */}
            <p className="text-[10px] text-tx-muted mt-2 pt-2 border-t border-edge">
              Click to view details
            </p>
          </div>
        );
      })()}

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
          searchTerm={searchTerm}
        />
      )}
    </div>
  );
});
