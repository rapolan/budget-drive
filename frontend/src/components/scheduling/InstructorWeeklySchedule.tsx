import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar, Clock, Users, CheckCircle, CalendarDays, TrendingUp } from 'lucide-react';
import { LoadingSpinner } from '@/components/common';
import { instructorsApi, lessonsApi, schedulingApi, studentsApi } from '@/api';
import type { Instructor, Lesson, InstructorAvailability } from '@/types';
import { format12Hour } from '@/utils/timeFormat';

interface InstructorWeeklyScheduleProps {
  onBookSlot: (instructor: Instructor, date: Date, time: string) => void;
  onViewLesson: (lesson: Lesson) => void;
}

interface TimeSlot {
  time: string;
  endTime: string;
  isAvailable: boolean;
  lesson?: Lesson;
}

interface DaySchedule {
  date: Date;
  dayName: string;
  dayNumber: number;
  slots: TimeSlot[];
}

const LESSON_DURATION_HOURS = 2;
const BUFFER_MINUTES = 30;
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const InstructorWeeklySchedule: React.FC<InstructorWeeklyScheduleProps> = ({
  onBookSlot,
  onViewLesson,
}) => {
  const [selectedInstructor, setSelectedInstructor] = useState<string>('');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = day; // Days since last Sunday
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - diff); // Go back to Sunday
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  });

  // Fetch instructors
  const { data: instructorsData, isLoading: loadingInstructors } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const instructors = instructorsData?.data || [];

  // Fetch students - only fetch a smaller set for better performance
  // We don't need all 1000 students upfront, just those with lessons this week
  const { data: studentsData } = useQuery({
    queryKey: ['students', 'weekly'],
    queryFn: () => studentsApi.getAll(1, 100), // Fetch first 100 students
  });

  const students = studentsData?.data || [];

  // Pre-compute student lookup map for O(1) access instead of O(n) searches
  const studentMap = useMemo(() => {
    const map = new Map<string, typeof students[0]>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  // Helper function to get student name - O(1) lookup
  const getStudentName = (studentId: string): string => {
    return studentMap.get(studentId)?.fullName || 'Unknown Student';
  };

  // Helper function to get student initials - O(1) lookup
  const getStudentInitials = (studentId: string): string => {
    const student = studentMap.get(studentId);
    if (!student) return '??';
    const names = student.fullName.split(' ');
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };

  // Helper function to get lesson type icon
  const getLessonTypeIcon = (lessonType: string): string => {
    switch (lessonType) {
      case 'behind_wheel':
        return '🚗';
      case 'classroom':
        return '📚';
      case 'observation':
        return '👁️';
      case 'road_test':
        return '🎯';
      default:
        return '📝';
    }
  };

  // Fetch lessons for the current week
  const weekEnd = useMemo(() => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [currentWeekStart]);

  const { data: lessonsData, isLoading: loadingLessons, error: lessonsError } = useQuery({
    queryKey: ['lessons', currentWeekStart.toISOString(), weekEnd.toISOString(), selectedInstructor],
    queryFn: () => lessonsApi.getAll(1, 1000),
    enabled: !!selectedInstructor,
  });

  // Filter lessons by instructor and date range
  // Only show active lessons (exclude cancelled and no_show) in the schedule
  const lessons = useMemo(() => {
    if (!lessonsData?.data || !selectedInstructor) return [];

    return lessonsData.data.filter((lesson) => {
      const lessonDate = new Date(lesson.date);
      const isInRange = lessonDate >= currentWeekStart && lessonDate <= weekEnd;
      const isInstructor = lesson.instructorId === selectedInstructor;
      const isActive = lesson.status === 'scheduled' || lesson.status === 'completed';
      return isInRange && isInstructor && isActive;
    });
  }, [lessonsData, selectedInstructor, currentWeekStart, weekEnd]);

  // Fetch availability for selected instructor (moved before weeklyStats that depends on it)
  const { data: availabilityData, isLoading: loadingAvailability, error: availabilityError } = useQuery({
    queryKey: ['availability', selectedInstructor],
    queryFn: () => schedulingApi.getInstructorAvailability(selectedInstructor),
    enabled: !!selectedInstructor,
  });

  // Calculate weekly stats
  const weeklyStats = useMemo(() => {
    const scheduledLessons = lessons.filter(l => l.status === 'scheduled').length;
    const completedLessons = lessons.filter(l => l.status === 'completed').length;
    const totalLessons = lessons.length;
    
    // Calculate total available slots from availability
    let totalAvailableSlots = 0;
    if (availabilityData) {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + dayOffset);
        const dayOfWeek = date.getDay();
        const dayAvailability = availabilityData.filter(
          (avail) => avail.dayOfWeek === dayOfWeek && avail.isActive
        );
        if (dayAvailability.length > 0) {
          const avail = dayAvailability[0];
          const [startHours, startMinutes] = avail.startTime.split(':').map(Number);
          const [endHours, endMinutes] = avail.endTime.split(':').map(Number);
          const startInMinutes = startHours * 60 + startMinutes;
          const endInMinutes = endHours * 60 + endMinutes;
          const slotDuration = (LESSON_DURATION_HOURS * 60) + BUFFER_MINUTES;
          const slotsForDay = Math.floor((endInMinutes - startInMinutes) / slotDuration);
          totalAvailableSlots += slotsForDay;
        }
      }
    }

    const openSlots = Math.max(0, totalAvailableSlots - totalLessons);
    const utilizationRate = totalAvailableSlots > 0 
      ? Math.round((totalLessons / totalAvailableSlots) * 100) 
      : 0;

    return {
      scheduledLessons,
      completedLessons,
      totalLessons,
      totalAvailableSlots,
      openSlots,
      utilizationRate
    };
  }, [lessons, availabilityData, currentWeekStart]);

  // Set initial instructor when data loads
  React.useEffect(() => {
    if (instructors.length > 0 && !selectedInstructor) {
      setSelectedInstructor(instructors[0].id.toString());
    }
  }, [instructors, selectedInstructor]);

  const instructor = useMemo(
    () => instructors.find((i) => i.id.toString() === selectedInstructor),
    [instructors, selectedInstructor]
  );

  // Generate time slots based on instructor's availability
  const generateTimeSlots = (availabilities: InstructorAvailability[], dayOfWeek: number): string[] => {
    if (!availabilities || availabilities.length === 0) {
      return [];
    }

    // Filter availability for the specific day of week - use only the FIRST active record
    const dayAvailability = availabilities.filter((avail) => avail.dayOfWeek === dayOfWeek && avail.isActive);

    if (dayAvailability.length === 0) {
      return [];
    }

    // Use only the first availability record to avoid duplicate slots
    const avail = dayAvailability[0];
    const slots: string[] = [];

    const [startHours, startMinutes] = avail.startTime.split(':').map(Number);
    const [endHours, endMinutes] = avail.endTime.split(':').map(Number);

    let currentHour = startHours;
    let currentMinute = startMinutes;

    const endTimeInMinutes = endHours * 60 + endMinutes;

    // Generate slots every (LESSON_DURATION + BUFFER) minutes
    while (currentHour * 60 + currentMinute + (LESSON_DURATION_HOURS * 60) <= endTimeInMinutes) {
      const timeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      slots.push(timeString);

      // Add lesson duration + buffer (2 hours + 30 minutes = 150 minutes)
      currentMinute += (LESSON_DURATION_HOURS * 60) + BUFFER_MINUTES;
      currentHour += Math.floor(currentMinute / 60);
      currentMinute = currentMinute % 60;
    }

    return slots.sort();
  };

  // Build unified time grid across all days
  const allTimeSlots = useMemo(() => {
    if (!availabilityData) return [];

    const allSlots = new Set<string>();

    // Collect all possible time slots from all days
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const slots = generateTimeSlots(availabilityData, dayOfWeek);
      slots.forEach(slot => allSlots.add(slot));
    }

    return Array.from(allSlots).sort();
  }, [availabilityData]);

  // Check if a date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if a date is in the past
  const isPast = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Pre-index lessons by date and time for O(1) lookup instead of O(n) search per slot
  const lessonsByDateTime = useMemo(() => {
    const index = new Map<string, typeof lessons[0]>();
    lessons.forEach((l) => {
      const lessonDate = new Date(l.date);
      const lessonTime = l.startTime.substring(0, 5); // Extract HH:MM from HH:MM:SS
      const key = `${lessonDate.toDateString()}-${lessonTime}`;
      index.set(key, l);
    });
    return index;
  }, [lessons]);

  // Calculate daily capacity (lessons per day) for each date
  const dailyCapacity = useMemo(() => {
    const capacityMap = new Map<string, { booked: number; max: number }>();

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(currentWeekStart);
      date.setDate(date.getDate() + dayOffset);
      date.setHours(0, 0, 0, 0);

      const dateKey = date.toDateString();
      const dayOfWeek = date.getDay();
      const dayTimeSlots = generateTimeSlots(availabilityData, dayOfWeek);
      const maxSlots = dayTimeSlots.length;

      // Count booked lessons for this day
      const bookedCount = lessons.filter((l) => {
        const lessonDate = new Date(l.date);
        return lessonDate.toDateString() === dateKey;
      }).length;

      capacityMap.set(dateKey, { booked: bookedCount, max: maxSlots });
    }

    return capacityMap;
  }, [currentWeekStart, availabilityData, lessons]);

  // Build weekly schedule
  const weeklySchedule = useMemo<DaySchedule[]>(() => {
    if (!instructor || !availabilityData || allTimeSlots.length === 0) return [];

    const schedule: DaySchedule[] = [];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(currentWeekStart);
      date.setDate(date.getDate() + dayOffset);
      date.setHours(0, 0, 0, 0);

      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      const dayTimeSlots = generateTimeSlots(availabilityData, dayOfWeek);
      const dayTimeSlotsSet = new Set(dayTimeSlots);

      const daySchedule: DaySchedule = {
        date,
        dayName: DAYS_OF_WEEK[dayOfWeek],
        dayNumber: date.getDate(),
        slots: allTimeSlots.map((time) => {
          const [hours, minutes] = time.split(':').map(Number);
          const slotDateTime = new Date(date);
          slotDateTime.setHours(hours, minutes, 0, 0);

          const endDateTime = new Date(slotDateTime);
          endDateTime.setHours(endDateTime.getHours() + LESSON_DURATION_HOURS);

          const endTime = `${endDateTime.getHours().toString().padStart(2, '0')}:${endDateTime.getMinutes().toString().padStart(2, '0')}`;

          // Check if this time slot is available for this day
          const isDayAvailable = dayTimeSlotsSet.has(time);

          // O(1) lesson lookup using pre-computed index
          const lookupKey = `${date.toDateString()}-${time}`;
          const lesson = lessonsByDateTime.get(lookupKey);

          return {
            time,
            endTime,
            isAvailable: isDayAvailable && !lesson,
            lesson,
          };
        }),
      };

      schedule.push(daySchedule);
    }

    return schedule;
  }, [instructor, availabilityData, allTimeSlots, currentWeekStart, lessonsByDateTime]);

  // Navigation handlers
  const goToPreviousWeek = () => {
    setCurrentWeekStart((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
  };

  const goToNextWeek = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 28); // 4 weeks ahead limit

    const nextWeek = new Date(currentWeekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);

    if (nextWeek <= maxDate) {
      setCurrentWeekStart(nextWeek);
    }
  };

  const goToToday = () => {
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const diff = day; // Days since last Sunday
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - diff); // Go back to Sunday
    weekStart.setHours(0, 0, 0, 0);
    setCurrentWeekStart(weekStart);
  };

  const formatWeekRange = () => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);

    const startMonth = currentWeekStart.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startDay = currentWeekStart.getDate();
    const endDay = end.getDate();
    const year = currentWeekStart.getFullYear();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}, ${year}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
    }
  };

  const isNextWeekDisabled = useMemo(() => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 28);
    const nextWeek = new Date(currentWeekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek > maxDate;
  }, [currentWeekStart]);

  if (loadingInstructors) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (instructors.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No instructors found. Add instructors to view schedules.</p>
      </div>
    );
  }

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
              <p className="text-2xl font-bold text-blue-900">{weeklyStats.totalLessons}</p>
              <p className="text-xs text-blue-600 font-medium">Lessons This Week</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500 rounded-lg">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-900">{weeklyStats.openSlots}</p>
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
              <p className="text-2xl font-bold text-purple-900">{weeklyStats.completedLessons}</p>
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
              <p className="text-2xl font-bold text-amber-900">{weeklyStats.utilizationRate}%</p>
              <p className="text-xs text-amber-600 font-medium">Utilization</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
        {/* Instructor Selector - Compact Style */}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <div className="flex gap-1.5 flex-wrap">
            {instructors.map((inst) => {
              const isSelected = inst.id.toString() === selectedInstructor;
              const initials = inst.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              const firstName = inst.fullName.split(' ')[0];
              return (
                <button
                  key={inst.id}
                  onClick={() => setSelectedInstructor(inst.id.toString())}
                  title={inst.fullName}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-200 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {initials}
                  </div>
                  <span className="text-xs font-medium hidden sm:inline">{firstName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Calendar className="h-4 w-4" />
            Today
          </button>
          <button
            onClick={goToPreviousWeek}
            className="rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[180px] text-center text-sm font-semibold text-gray-900 bg-gray-50 px-4 py-2 rounded-lg">
            {formatWeekRange()}
          </span>
          <button
            onClick={goToNextWeek}
            disabled={isNextWeekDisabled}
            className="rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {(loadingLessons || loadingAvailability) && (
        <div className="flex justify-center items-center py-8">
          <LoadingSpinner />
        </div>
      )}

      {/* Error State */}
      {(lessonsError || availabilityError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">Failed to load schedule</h3>
              <div className="mt-2 text-sm text-red-700">
                {lessonsError ? 'Could not load lessons. ' : ''}
                {availabilityError ? 'Could not load instructor availability. ' : ''}
                Please try again or contact support if the problem persists.
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Grid */}
      {!loadingLessons && !loadingAvailability && instructor && weeklySchedule.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 table-fixed md:table-auto">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 z-10">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Time
                    </div>
                  </th>
                  {weeklySchedule.map((day) => {
                    const todayColumn = isToday(day.date);
                    const pastDay = isPast(day.date);
                    const capacity = dailyCapacity.get(day.date.toDateString());
                    const hasCapacity = capacity && capacity.max > 0;
                    const isFull = capacity && capacity.booked >= capacity.max;
                    const capacityPercentage = hasCapacity ? Math.round((capacity.booked / capacity.max) * 100) : 0;

                    return (
                      <th
                        key={day.date.toISOString()}
                        className={`px-4 py-3 text-center text-xs font-medium uppercase tracking-wider min-w-[140px] relative ${
                          todayColumn
                            ? 'bg-gradient-to-b from-blue-100 to-blue-50 text-blue-900'
                            : pastDay
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-gray-50 text-gray-500'
                        }`}
                      >
                        {/* Today indicator bar */}
                        {todayColumn && (
                          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500"></div>
                        )}
                        <div className="flex items-center justify-center gap-1">
                          <span className={todayColumn ? 'font-bold' : ''}>{day.dayName.slice(0, 3)}</span>
                          {todayColumn && (
                            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white animate-pulse">
                              TODAY
                            </span>
                          )}
                        </div>
                        <div className={`text-xl font-bold mt-1 ${
                          todayColumn 
                            ? 'text-blue-900 bg-blue-200 w-8 h-8 rounded-full flex items-center justify-center mx-auto' 
                            : pastDay 
                            ? 'text-gray-400' 
                            : 'text-gray-900'
                        }`}>
                          {day.dayNumber}
                        </div>
                        {/* Capacity Progress Bar */}
                        {hasCapacity && !pastDay && (
                          <div className="mt-3 px-1">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className={isFull ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                                {capacity.booked}/{capacity.max}
                              </span>
                              <span className={
                                isFull ? 'text-red-600 font-semibold' 
                                : capacityPercentage >= 75 ? 'text-amber-600' 
                                : 'text-green-600'
                              }>
                                {capacityPercentage}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isFull 
                                    ? 'bg-gradient-to-r from-red-500 to-red-600' 
                                    : capacityPercentage >= 75 
                                    ? 'bg-gradient-to-r from-amber-400 to-amber-500' 
                                    : 'bg-gradient-to-r from-green-400 to-green-500'
                                }`}
                                style={{ width: `${capacityPercentage}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {weeklySchedule[0]?.slots.map((_, slotIndex) => (
                  <tr key={slotIndex} className="hover:bg-gray-50/50 transition-colors">
                    <td className="sticky left-0 bg-white px-4 py-3 text-sm text-gray-900 border-r border-gray-200 whitespace-nowrap z-10">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                        <div>
                          <div className="font-semibold">{format12Hour(weeklySchedule[0].slots[slotIndex].time)}</div>
                          <div className="text-xs text-gray-400">to {format12Hour(weeklySchedule[0].slots[slotIndex].endTime)}</div>
                        </div>
                      </div>
                    </td>
                    {weeklySchedule.map((day) => {
                      const slot = day.slots[slotIndex];
                      const todayColumn = isToday(day.date);
                      const pastDay = isPast(day.date);

                      return (
                        <td
                          key={day.date.toISOString()}
                          className={`px-2 py-2 transition-colors ${
                            todayColumn 
                              ? 'bg-blue-50/50' 
                              : pastDay 
                              ? 'bg-gray-50/50' 
                              : ''
                          }`}
                        >
                          {slot.isAvailable ? (
                            <button
                              type="button"
                              onClick={() => onBookSlot(instructor, day.date, slot.time)}
                              disabled={pastDay}
                              className={`w-full rounded-lg px-3 py-4 text-center text-sm font-medium transition-all duration-200 group ${
                                pastDay
                                  ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                                  : 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-dashed border-green-300 text-green-700 hover:border-solid hover:border-green-400 hover:from-green-100 hover:to-emerald-100 hover:shadow-md hover:scale-[1.02]'
                              }`}
                            >
                              <div className="flex flex-col items-center gap-1">
                                {!pastDay && (
                                  <span className="text-lg group-hover:scale-110 transition-transform">✨</span>
                                )}
                                <span>{pastDay ? 'Past' : 'Available'}</span>
                              </div>
                            </button>
                          ) : slot.lesson ? (
                            <button
                              type="button"
                              onClick={() => onViewLesson(slot.lesson!)}
                              className="w-full rounded-lg bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-2 border-blue-200 px-3 py-3 text-center transition-all duration-200 hover:border-blue-400 hover:shadow-lg hover:scale-[1.02] group"
                            >
                              <div className="flex items-center justify-center gap-2 mb-1">
                                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md group-hover:shadow-lg transition-shadow">
                                  {getStudentInitials(slot.lesson.studentId)}
                                </div>
                                <span className="text-xl group-hover:scale-110 transition-transform">
                                  {getLessonTypeIcon(slot.lesson.lessonType)}
                                </span>
                              </div>
                              <div className="text-sm font-semibold text-blue-900 truncate">
                                {getStudentName(slot.lesson.studentId)}
                              </div>
                              <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${
                                slot.lesson.status === 'completed' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {slot.lesson.status === 'completed' ? '✓ ' : ''}{slot.lesson.status}
                              </div>
                            </button>
                          ) : (
                            <div className={`w-full rounded-lg border px-3 py-4 text-center text-sm ${
                              pastDay
                                ? 'bg-gray-100 border-gray-200 text-gray-300'
                                : 'bg-gray-50 border-gray-200 text-gray-400'
                            }`}>
                              <span className="text-gray-300">{pastDay ? '—' : '○'}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loadingLessons && !loadingAvailability && instructor && weeklySchedule.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">
            No availability configured for this instructor. Please set up availability in the instructor settings.
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-8 text-sm text-gray-600 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-dashed border-green-300 flex items-center justify-center text-[10px]">✨</div>
          <span className="font-medium">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200"></div>
          <span className="font-medium">Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-300 text-[10px]">○</div>
          <span className="font-medium">Unavailable</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-b from-blue-100 to-blue-50 border-t-2 border-blue-500"></div>
          <span className="font-medium">Today</span>
        </div>
      </div>
    </div>
  );
};
