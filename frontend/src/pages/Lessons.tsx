import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit, X, CheckCircle, Calendar, RefreshCw, CalendarDays, MapPin, CalendarRange, Clock, TrendingUp, AlertCircle, Keyboard, LayoutGrid, LayoutList } from 'lucide-react';
import { lessonsApi, studentsApi, instructorsApi, schedulingApi } from '@/api';
import type { Lesson, Instructor } from '@/types';
import { LessonModal, LessonsCalendarView, TodaysScheduleWidget, StatusMenu } from '@/components/lessons';
import type { LessonsCalendarViewRef } from '@/components/lessons';
import { SmartBookingForm } from '@/components/scheduling/SmartBookingForm';
import { InstructorWeeklySchedule } from '@/components/scheduling/InstructorWeeklySchedule';
import type { InstructorWeeklyScheduleRef } from '@/components/scheduling/InstructorWeeklySchedule';
import { EmptyState, LoadingSpinner, FilterButton, BackButton, ToastContainer, DateRangeFilter, KeyboardShortcutsHelp } from '@/components/common';
import type { DateRangeValue } from '@/components/common';
import { AuditColumn } from '@/components/common/AuditColumn';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useToast } from '@/hooks/useToast';
import { useSessionState } from '@/hooks/useSessionState';
import { useTenant } from '@/contexts/TenantContext';
import { addCalendarDays, parseLocalDate } from '@/utils/timeFormat';

type ViewMode = 'table' | 'cards' | 'calendar' | 'weekly';
const isViewMode = (v: string): v is ViewMode =>
  v === 'table' || v === 'cards' || v === 'calendar' || v === 'weekly';
type StatusFilter = 'all' | 'today' | 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export const LessonsPage: React.FC = () => {
  const location = useLocation();
  const { tenantNow } = useTenant();

  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();

  // Toast notifications
  const { toasts, success, removeToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmartBookingOpen, setIsSmartBookingOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useSessionState<ViewMode>('lessons-view-mode', 'table', isViewMode);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('scheduled');
  const [preselectedInstructorId, setPreselectedInstructorId] = useState<string | null>(null);
  const [preselectedDate, setPreselectedDate] = useState<Date | null>(null);
  const [preselectedTime, setPreselectedTime] = useState<{ start: string; end: string } | null>(null);
  const [preselectedStudentId, setPreselectedStudentId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ start: '', end: '', preset: 'all' });
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const queryClient = useQueryClient();
  const tableRef = useRef<HTMLDivElement>(null);
  const calendarSectionRef = useRef<HTMLDivElement>(null);
  const weeklySectionRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<LessonsCalendarViewRef>(null);
  const weeklyRef = useRef<InstructorWeeklyScheduleRef>(null);

  // Scroll to a view section with smooth animation
  const scrollToViewSection = (view: 'table' | 'cards' | 'calendar' | 'weekly') => {
    const refMap = {
      table: tableRef,
      cards: tableRef, // Cards view uses the same ref as table
      calendar: calendarSectionRef,
      weekly: weeklySectionRef,
    };
    const ref = refMap[view];
    if (ref?.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      ref.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  };

  // Scroll to table with smooth animation (fallback to instant for reduced motion)
  const scrollToTable = () => {
    scrollToViewSection('table');
  };

  // Handle stat card click - set filter and scroll to table
  const handleStatCardClick = (filter: StatusFilter) => {
    setStatusFilter(filter);
    setViewMode('table'); // Switch to table view when clicking stats
    setTimeout(scrollToTable, 100);
  };

  // Handle navigation state to open SmartBooking or scroll to table
  useEffect(() => {
    if (location.state?.openSmartBooking) {
      setIsSmartBookingOpen(true);
      // Clear the state after opening
      window.history.replaceState({}, document.title);
    }
    if (location.state?.scrollToTable) {
      setViewMode('table');
      setStatusFilter('scheduled');
      // Delay scroll to ensure table is rendered
      setTimeout(scrollToTable, 200);
      // Clear the state after handling
      window.history.replaceState({}, document.title);
    }
    // scrollToTable is intentionally omitted - it's a plain closure
    // recreated every render, and this effect should only re-run when
    // `location` itself changes, not on every render. setViewMode is
    // useSessionState's own stable setter (like useState's), safe to
    // include.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, setViewMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or modal is open
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        isModalOpen ||
        isSmartBookingOpen
      ) {
        return;
      }

      // Close shortcuts help on Escape
      if (e.key === 'Escape') {
        setShowShortcutsHelp(false);
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          if (viewMode === 'calendar') calendarRef.current?.goToPrevious();
          if (viewMode === 'weekly') weeklyRef.current?.goToPrevious();
          break;
        case 'ArrowRight':
          if (viewMode === 'calendar') calendarRef.current?.goToNext();
          if (viewMode === 'weekly') weeklyRef.current?.goToNext();
          break;
        case 't':
        case 'T':
          if (viewMode === 'calendar') calendarRef.current?.goToToday();
          if (viewMode === 'weekly') weeklyRef.current?.goToToday();
          break;
        case 'n':
        case 'N':
          handleAddNew();
          break;
        case '1':
          setViewMode('table');
          break;
        case '2':
          setViewMode('cards');
          break;
        case '3':
          setViewMode('calendar');
          break;
        case '4':
          setViewMode('weekly');
          break;
        case '?':
          setShowShortcutsHelp(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, isModalOpen, isSmartBookingOpen, setViewMode]);

  const { data, isLoading } = useQuery({
    queryKey: ['lessons', currentPage],
    queryFn: () => lessonsApi.getAll(currentPage, 50),
  });

  // Fetch related data for display
  const { data: studentsData } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
  });

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });


  // Fetch availability data for calendar view
  const { data: availabilityData } = useQuery({
    queryKey: ['availability', 'all'],
    queryFn: () => schedulingApi.getAllInstructorsAvailability(),
    enabled: viewMode === 'calendar', // Only fetch when in calendar view
  });

  // Helper to invalidate all lesson-related queries (handles Weekly view's complex query keys)
  const invalidateAllLessonQueries = () => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'lessons' ||
        query.queryKey[0] === 'instructor-lessons'
    });
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.cancel(id),
    onSuccess: () => {
      invalidateAllLessonQueries();
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.complete(id),
    onSuccess: () => {
      invalidateAllLessonQueries();
    },
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.noShow(id),
    onSuccess: () => {
      invalidateAllLessonQueries();
    },
  });


  const handleEdit = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setIsModalOpen(true);
  };

  const handleReschedule = (lesson: Lesson) => {
    // Open SmartBookingForm with the student preselected
    setPreselectedStudentId(lesson.studentId);
    setPreselectedInstructorId(null);
    setPreselectedDate(null);
    setPreselectedTime(null);
    setIsSmartBookingOpen(true);
  };


  const handleCancel = async (id: string) => {
    if (window.confirm('Are you sure you want to cancel this lesson?')) {
      await cancelMutation.mutateAsync(id);
      success('Lesson cancelled successfully');
    }
  };

  const handleComplete = async (id: string) => {
    if (window.confirm('Mark this lesson as completed?')) {
      await completeMutation.mutateAsync(id);
      success('Lesson marked as completed');
      // Automatically filter to scheduled lessons after completing
      if (statusFilter === 'all') {
        setStatusFilter('scheduled');
      }
    }
  };

  const handleNoShow = async (id: string) => {
    if (window.confirm('Mark this lesson as no-show? The student did not arrive for their scheduled lesson.')) {
      await noShowMutation.mutateAsync(id);
      success('Lesson marked as no-show');
      // Automatically filter to scheduled lessons after marking no-show
      if (statusFilter === 'all') {
        setStatusFilter('scheduled');
      }
    }
  };

  const handleAddNew = () => {
    setPreselectedInstructorId(null);
    setPreselectedStudentId(null);
    setPreselectedDate(null);
    setPreselectedTime(null);
    setIsSmartBookingOpen(true);
  };

  const handleAvailabilityClick = (instructorId: string, date: Date, startTime: string, endTime: string) => {
    setPreselectedInstructorId(instructorId);
    setPreselectedStudentId(null);
    setPreselectedDate(date);
    setPreselectedTime({ start: startTime, end: endTime });
    setIsSmartBookingOpen(true);
  };

  const handleWeeklyBookSlot = (instructor: Instructor, date: Date, time: string) => {
    const [hours, minutes] = time.split(':');
    const endDateTime = new Date(date);
    endDateTime.setHours(parseInt(hours) + 2, parseInt(minutes), 0, 0);
    const endTime = `${endDateTime.getHours().toString().padStart(2, '0')}:${endDateTime.getMinutes().toString().padStart(2, '0')}`;

    setPreselectedInstructorId(instructor.id.toString());
    setPreselectedStudentId(null);
    setPreselectedDate(date);
    setPreselectedTime({ start: time, end: endTime });
    setIsSmartBookingOpen(true);
  };

  const handleViewLessonFromWeekly = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setIsModalOpen(true);
  };

  const handleBookingComplete = async (_lessonId: string) => {
    setIsSmartBookingOpen(false);
    setPreselectedInstructorId(null);
    setPreselectedStudentId(null);
    setPreselectedDate(null);
    setPreselectedTime(null);
    // Invalidate ALL lesson-related queries (including Weekly view's complex keys)
    invalidateAllLessonQueries();
    // Also invalidate availability since booking changes available slots
    await queryClient.invalidateQueries({ queryKey: ['availability'] });
    // Show success notification
    success('Lesson booked successfully!', 'The lesson has been added to the schedule.');
  };

  // Helper functions to get names from IDs
  const getStudentName = (studentId: string) => {
    const student = studentsData?.data?.find((s) => s.id === studentId);
    return student?.fullName || 'Unknown Student';
  };

  const getInstructorName = (instructorId: string) => {
    const instructor = instructorsData?.data?.find((i) => i.id === instructorId);
    return instructor?.fullName || 'Unknown Instructor';
  };


  // Helper to check if lesson is within 24 hours, against the tenant's
  // current wall-clock time - never the browser's.
  const isUpcoming = (lesson: Lesson) => {
    if (!tenantNow) return false;
    const lessonDateStr = String(lesson.date).split('T')[0];
    if (lessonDateStr !== tenantNow.today && lessonDateStr !== tenantNow.tomorrow) return false;
    // Minutes-since-midnight on the lesson's own calendar day, compared
    // against the tenant's current time similarly expressed - both are
    // plain HH:MM strings, so this is timezone-safe string/number math,
    // never a Date instant.
    const [nowH, nowM] = tenantNow.currentTime.split(':').map(Number);
    const [lessonH, lessonM] = lesson.startTime.split(':').map(Number);
    const nowMinutes = nowH * 60 + nowM;
    const lessonMinutes = lessonH * 60 + lessonM + (lessonDateStr === tenantNow.tomorrow ? 24 * 60 : 0);
    const diffMinutes = lessonMinutes - nowMinutes;
    return diffMinutes > 0 && diffMinutes <= 24 * 60 && lesson.status === 'scheduled';
  };

  // Calculate status counts for filter buttons
  const statusCounts = React.useMemo(() => {
    const counts = {
      all: data?.data?.length || 0,
      today: 0,
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
    if (!tenantNow) return counts;

    data?.data?.forEach((lesson) => {
      // Count today's lessons (any status)
      if (String(lesson.date).split('T')[0] === tenantNow.today) {
        counts.today++;
      }

      // Count by status
      if (lesson.status === 'scheduled') counts.scheduled++;
      else if (lesson.status === 'completed') counts.completed++;
      else if (lesson.status === 'cancelled') counts.cancelled++;
      else if (lesson.status === 'no_show') counts.no_show++;
    });
    return counts;
  }, [data?.data, tenantNow]);

  // Calculate stats for dashboard cards
  const stats = useMemo(() => {
    const empty = { todayLessons: 0, upcomingToday: 0, thisWeekLessons: 0, completedThisMonth: 0, totalHoursThisMonth: 0 };
    if (!tenantNow) return empty;

    let todayLessons = 0;
    let upcomingToday = 0;
    let thisWeekLessons = 0;
    let completedThisMonth = 0;
    let totalHoursThisMonth = 0;

    data?.data?.forEach((lesson) => {
      const lessonDateStr = String(lesson.date).split('T')[0];

      // Today's lessons
      if (lessonDateStr === tenantNow.today) {
        todayLessons++;
        if (lesson.status === 'scheduled' && lesson.startTime > tenantNow.currentTime) {
          upcomingToday++;
        }
      }

      // This week's lessons (scheduled only)
      if (lessonDateStr >= tenantNow.weekStart && lessonDateStr <= tenantNow.weekEnd && lesson.status === 'scheduled') {
        thisWeekLessons++;
      }

      // Completed this month
      if (
        lessonDateStr >= tenantNow.monthBoundaries.start &&
        lessonDateStr <= tenantNow.monthBoundaries.end &&
        lesson.status === 'completed'
      ) {
        completedThisMonth++;
        // Calculate hours from start and end time
        const [startH, startM] = lesson.startTime.split(':').map(Number);
        const [endH, endM] = lesson.endTime.split(':').map(Number);
        const hours = (endH - startH) + (endM - startM) / 60;
        totalHoursThisMonth += hours;
      }
    });

    return {
      todayLessons,
      upcomingToday,
      thisWeekLessons,
      completedThisMonth,
      totalHoursThisMonth: Math.round(totalHoursThisMonth * 10) / 10,
    };
  }, [data?.data, tenantNow]);

  // Get today's lessons for the TodaysScheduleWidget
  const todaysLessonsForWidget = useMemo(() => {
    if (!data?.data || !tenantNow) return [];
    return data.data.filter((lesson) => String(lesson.date).split('T')[0] === tenantNow.today);
  }, [data?.data, tenantNow]);

  const filteredLessons = data?.data?.filter((lesson) => {
    // lesson.date is a DATE-only value (no wall-clock time) - compare it as
    // a plain YYYY-MM-DD string directly rather than round-tripping through
    // new Date().toISOString(), which UTC-shifts the calendar day for
    // roughly half of every browser timezone.
    const lessonDateStr = String(lesson.date).split('T')[0];

    // Date range filter
    if (dateRange.start || dateRange.end) {
      if (dateRange.start && lessonDateStr < dateRange.start) {
        return false;
      }
      if (dateRange.end && lessonDateStr > dateRange.end) {
        return false;
      }
    }

    // Status filter
    if (statusFilter === 'today') {
      // Today filter: show only today's lessons (any status)
      if (!tenantNow || lessonDateStr !== tenantNow.today) {
        return false;
      }
    } else if (statusFilter !== 'all' && lesson.status !== statusFilter) {
      return false;
    }

    // Search filter
    const studentName = getStudentName(lesson.studentId).toLowerCase();
    const instructorName = getInstructorName(lesson.instructorId).toLowerCase();
    const search = searchTerm.toLowerCase();
    return (
      studentName.includes(search) ||
      instructorName.includes(search) ||
      lesson.lessonType.toLowerCase().includes(search) ||
      lesson.status.toLowerCase().includes(search)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-status-info-bg text-status-info-text';
      case 'completed':
        return 'bg-status-success-bg text-status-success-text';
      case 'cancelled':
        return 'bg-status-danger-bg text-status-danger-text';
      case 'no_show':
        return 'bg-status-warning-bg text-status-warning-text';
      default:
        return 'bg-surface2 text-tx-primary';
    }
  };

  // lesson.date is a DATE-only value (no wall-clock time), typed as `Date`
  // but transmitted as an ISO string ("2026-08-20T00:00:00.000Z") - passing
  // it straight to `new Date(...).toLocaleDateString()` renders the UTC
  // instant in the BROWSER's local zone, which rolls the calendar day back
  // one for any zone west of UTC (e.g. shows "Aug 19" for a lesson stored
  // as Aug 20). parseLocalDate strips to the date-only string first, same
  // as every other date derivation in this file.
  const formatDate = (date: Date) => {
    return parseLocalDate(String(date)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    // Convert HH:MM:SS to HH:MM AM/PM
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Sort lessons by date and start time
  const sortByDateTime = (a: Lesson, b: Lesson) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    // Same date, sort by start time
    return a.startTime.localeCompare(b.startTime);
  };

  // Group lessons by date category, relative to the tenant's own today.
  const groupLessonsByDate = (lessons: Lesson[], tenantToday: string, tenantTomorrowStr: string, nextWeekStr: string) => {
    const groups = {
      today: [] as Lesson[],
      tomorrow: [] as Lesson[],
      thisWeek: [] as Lesson[],
      later: [] as Lesson[],
      past: [] as Lesson[],
    };

    lessons.forEach((lesson) => {
      const lessonDateStr = String(lesson.date).split('T')[0];

      if (lessonDateStr === tenantToday) {
        groups.today.push(lesson);
      } else if (lessonDateStr === tenantTomorrowStr) {
        groups.tomorrow.push(lesson);
      } else if (lessonDateStr > tenantTomorrowStr && lessonDateStr <= nextWeekStr) {
        groups.thisWeek.push(lesson);
      } else if (lessonDateStr > nextWeekStr) {
        groups.later.push(lesson);
      } else {
        groups.past.push(lesson);
      }
    });

    // Sort each group by date and start time
    groups.today.sort(sortByDateTime);
    groups.tomorrow.sort(sortByDateTime);
    groups.thisWeek.sort(sortByDateTime);
    groups.later.sort(sortByDateTime);
    groups.past.sort((a, b) => sortByDateTime(b, a)); // Past: most recent first

    return groups;
  };

  const groupedLessons = React.useMemo(() => {
    if (!filteredLessons || !tenantNow) return null;
    const nextWeekStr = addCalendarDays(tenantNow.today, 7);
    return groupLessonsByDate(filteredLessons, tenantNow.today, tenantNow.tomorrow, nextWeekStr);
  }, [filteredLessons, tenantNow]);

  // Reusable function to render a lesson row
  const renderLessonRow = (lesson: Lesson) => {
    const upcoming = isUpcoming(lesson);
    return (
      <tr
        key={lesson.id}
        className={`group hover:bg-surface2 transition-colors cursor-pointer ${upcoming ? 'border-l-4 border-l-status-warning-text bg-status-warning-bg' : ''}`}
        onClick={() => handleEdit(lesson)}
      >
        <td className="whitespace-nowrap px-6 py-4 align-middle">
          <div className="flex items-center gap-3 h-full">
            <div className={`p-2 rounded-lg ${upcoming ? 'bg-status-warning-bg' : 'bg-status-info-bg'}`}>
              <Clock className={`h-4 w-4 ${upcoming ? 'text-status-warning-text' : 'text-primary'}`} />
            </div>
            <div>
              <div className="text-sm font-medium text-tx-primary">
                {formatDate(lesson.date)}
              </div>
              <div className="text-sm text-tx-muted">
                {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
              </div>
              {/* Row actions - under Date & Time, not a right-side sticky
                  column (same fix/pattern as the Students list: actions on
                  the far right required scrolling right regardless of how
                  they appeared). A lesson row has no single "name" column
                  the way a student row does, so Date & Time - the leftmost,
                  always-on-screen cell, already the anchor for the "Soon"
                  badge above - takes over as the anchor instead. Reserved
                  height (min-h-[24px], unconditional) so a hovered row
                  never reflows its neighbors; only opacity animates.
                  (hover: hover)-gated: hidden until the cursor is anywhere
                  on the row or an action receives keyboard focus, always
                  visible on touch/coarse-pointer devices.

                  Buttons are Lessons-scoped smaller than the Students
                  list's row-action buttons (h-3 w-3 icon at p-1.5 padding
                  = 24x24px total) rather than shrinking the shared
                  p-1.5/h-3.5 (26x26px) pattern Students also uses -
                  Students keeps its own larger icon size unchanged.
                  24x24 is WCAG 2.5.8 AA's minimum target size, so this is
                  the floor, not an arbitrary shrink. */}
              <div className="min-h-[24px] flex items-center gap-0.5 mt-0.5 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                {lesson.status === 'scheduled' && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(lesson);
                      }}
                      aria-label="Edit lesson"
                      title="Edit lesson"
                      className="p-1.5 text-primary hover:brightness-75 hover:bg-status-info-bg rounded-lg transition-all hover:scale-110"
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleComplete(lesson.id);
                      }}
                      aria-label="Mark lesson as completed"
                      title="Mark as completed"
                      className="p-1.5 text-status-success-text hover:brightness-75 hover:bg-status-success-bg rounded-lg transition-all hover:scale-110"
                    >
                      <CheckCircle className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNoShow(lesson.id);
                      }}
                      aria-label="Mark lesson as no-show"
                      title="Mark as no-show"
                      className="p-1.5 text-status-warning-text hover:brightness-75 hover:bg-status-warning-bg rounded-lg transition-all hover:scale-110"
                    >
                      <AlertCircle className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancel(lesson.id);
                      }}
                      aria-label="Cancel lesson"
                      title="Cancel lesson"
                      className="p-1.5 text-status-danger-text hover:brightness-75 hover:bg-status-danger-bg rounded-lg transition-all hover:scale-110"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
                {lesson.status === 'cancelled' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReschedule(lesson);
                    }}
                    aria-label="Reschedule lesson"
                    title="Reschedule lesson"
                    className="p-1.5 text-primary hover:brightness-75 hover:bg-status-info-bg rounded-lg transition-all hover:scale-110"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            {upcoming && (
              <span className="inline-flex items-center rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-medium text-status-warning-text animate-pulse">
                <AlertCircle className="h-3 w-3 mr-1" />
                Soon
              </span>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
              {getStudentName(lesson.studentId).split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="text-sm font-medium text-tx-primary">{getStudentName(lesson.studentId)}</div>
          </div>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
              {getInstructorName(lesson.instructorId).split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="text-sm text-tx-primary">{getInstructorName(lesson.instructorId)}</div>
          </div>
        </td>
        <td className="px-6 py-4">
          {lesson.pickupAddress ? (
            <div className="flex items-start gap-2 max-w-xs">
              <MapPin className="h-4 w-4 text-tx-muted mt-0.5 flex-shrink-0" />
              <div className="text-sm text-tx-secondary truncate" title={lesson.pickupAddress}>
                {lesson.pickupAddress}
              </div>
            </div>
          ) : (
            <span className="text-sm text-tx-muted italic">Not specified</span>
          )}
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-surface2 text-tx-secondary capitalize">
            {lesson.lessonType.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          {(() => {
            const badge = (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusColor(
                  lesson.status
                )}`}
              >
                {lesson.status === 'scheduled' && <Clock className="h-3 w-3 mr-1" />}
                {lesson.status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                {lesson.status === 'cancelled' && <X className="h-3 w-3 mr-1" />}
                {lesson.status === 'no_show' && <AlertCircle className="h-3 w-3 mr-1" />}
                {lesson.status.replace(/_/g, ' ')}
              </span>
            );
            return lesson.status === 'scheduled' ? (
              <StatusMenu
                trigger={badge}
                onComplete={() => handleComplete(lesson.id)}
                onNoShow={() => handleNoShow(lesson.id)}
                onCancel={() => handleCancel(lesson.id)}
              />
            ) : (
              badge
            );
          })()}
        </td>
        {/* History - Hidden on mobile */}
        <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
          <AuditColumn
            createdByName={lesson.createdByName}
            updatedByName={lesson.updatedByName}
            createdAt={lesson.createdAt}
            updatedAt={lesson.updatedAt}
          />
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-2xl font-bold text-tx-primary mt-2">Lessons</h1>
          <p className="mt-1 text-sm text-tx-muted">
            Manage driving lessons and appointments
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Keyboard Shortcuts Button */}
          <button
            onClick={() => setShowShortcutsHelp(true)}
            className="flex items-center justify-center rounded-lg border border-edge p-2 text-tx-muted hover:bg-surface2 hover:text-tx-secondary transition-all"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-5 w-5" />
          </button>

          <button
            onClick={handleAddNew}
            className="flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all"
          >
            <Plus className="mr-2 h-5 w-5 flex-shrink-0" />
            Book New Lesson
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Lessons */}
        <div 
          className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('today')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-info-bg rounded-lg group-hover:brightness-95 transition-colors">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            {stats.upcomingToday > 0 && (
              <span className="flex items-center text-xs font-medium text-status-warning-text bg-status-warning-bg px-2 py-1 rounded-full">
                <Clock className="h-3 w-3 mr-1" />
                {stats.upcomingToday} upcoming
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{stats.todayLessons}</p>
            <p className="text-sm text-tx-muted">Today's Lessons</p>
          </div>
        </div>

        {/* This Week */}
        <div 
          className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => {
            setStatusFilter('scheduled');
            setViewMode('weekly');
            setTimeout(scrollToTable, 100);
          }}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
              <CalendarRange className="h-5 w-5 text-purple-600" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{stats.thisWeekLessons}</p>
            <p className="text-sm text-tx-muted">Scheduled This Week</p>
          </div>
        </div>

        {/* Completed This Month */}
        <div 
          className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('completed')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-success-bg rounded-lg group-hover:brightness-95 transition-colors">
              <CheckCircle className="h-5 w-5 text-status-success-text" />
            </div>
            <span className="text-xs font-medium text-status-success-text bg-status-success-bg px-2 py-1 rounded-full">
              {stats.totalHoursThisMonth} hrs
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{stats.completedThisMonth}</p>
            <p className="text-sm text-tx-muted">Completed This Month</p>
          </div>
        </div>

        {/* Active Bookings */}
        <div 
          className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('scheduled')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-warning-bg rounded-lg group-hover:brightness-95 transition-colors">
              <TrendingUp className="h-5 w-5 text-status-warning-text" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{statusCounts.scheduled}</p>
            <p className="text-sm text-tx-muted">Active Bookings</p>
          </div>
        </div>
      </div>

      {/* Search - Show in both views */}
      <div className="flex items-center rounded-xl border border-edge bg-surface px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
        <Search className="h-5 w-5 text-tx-muted flex-shrink-0" />
        <input
          type="text"
          placeholder={
            viewMode === 'calendar'
              ? "Filter by student, instructor, or type..."
              : "Search by student, instructor, type, or status..."
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="nope"
          className="ml-3 flex-1 border-none bg-transparent outline-none text-tx-primary placeholder-gray-400"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="p-1 text-tx-muted hover:text-tx-secondary rounded-full hover:bg-surface2 transition-colors"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Date Range Filter */}
      <DateRangeFilter
        value={dateRange}
        onChange={setDateRange}
        tenantToday={tenantNow?.today ?? ''}
        tenantWeekStart={tenantNow?.weekStart ?? ''}
        tenantWeekEnd={tenantNow?.weekEnd ?? ''}
        tenantMonthStart={tenantNow?.monthBoundaries.start ?? ''}
        tenantMonthEnd={tenantNow?.monthBoundaries.end ?? ''}
      />

      {/* Status Filter - Show in all views */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-surface p-4 shadow-sm border border-edge">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-tx-secondary">Status:</span>
        </div>
        <div className="flex flex-wrap gap-2 flex-1">
          <FilterButton
            label="All"
            isActive={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            count={statusCounts.all}
            variant="default"
          />
          <FilterButton
            label="Today"
            isActive={statusFilter === 'today'}
            onClick={() => setStatusFilter('today')}
            count={statusCounts.today}
            variant="info"
          />
          <FilterButton
            label="Scheduled"
            isActive={statusFilter === 'scheduled'}
            onClick={() => setStatusFilter('scheduled')}
            count={statusCounts.scheduled}
            variant="info"
          />
          <FilterButton
            label="Completed"
            isActive={statusFilter === 'completed'}
            onClick={() => setStatusFilter('completed')}
            count={statusCounts.completed}
            variant="success"
          />
          <FilterButton
            label="Cancelled"
            isActive={statusFilter === 'cancelled'}
            onClick={() => setStatusFilter('cancelled')}
            count={statusCounts.cancelled}
            variant="danger"
          />
          <FilterButton
            label="No Show"
            isActive={statusFilter === 'no_show'}
            onClick={() => setStatusFilter('no_show')}
            count={statusCounts.no_show}
            variant="warning"
          />
          {/* View Toggle - moved here from the page header so switching
              views (e.g. Table -> Weekly) never requires scrolling back up
              first; selection still persists via useSessionState
              ('lessons-view-mode'), unchanged. */}
          <div className="flex rounded-lg border border-edge-strong bg-surface overflow-hidden ml-auto">
            <button
              onClick={() => {
                setViewMode('table');
                setTimeout(() => scrollToViewSection('table'), 100);
              }}
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-primary text-white'
                  : 'text-tx-secondary hover:bg-surface2'
              }`}
              title="Table view"
            >
              <LayoutList className="h-4 w-4 sm:mr-2 flex-shrink-0" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              onClick={() => {
                setViewMode('cards');
                setTimeout(() => scrollToViewSection('cards'), 100);
              }}
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium transition-all ${
                viewMode === 'cards'
                  ? 'bg-primary text-white'
                  : 'text-tx-secondary hover:bg-surface2'
              }`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4 sm:mr-2 flex-shrink-0" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => {
                setViewMode('calendar');
                setTimeout(() => scrollToViewSection('calendar'), 100);
              }}
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium transition-all ${
                viewMode === 'calendar'
                  ? 'bg-primary text-white'
                  : 'text-tx-secondary hover:bg-surface2'
              }`}
              title="Month view"
            >
              <Calendar className="h-4 w-4 sm:mr-2 flex-shrink-0" />
              <span className="hidden sm:inline">Month</span>
            </button>
            <button
              onClick={() => {
                setViewMode('weekly');
                setTimeout(() => scrollToViewSection('weekly'), 100);
              }}
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium transition-all ${
                viewMode === 'weekly'
                  ? 'bg-primary text-white'
                  : 'text-tx-secondary hover:bg-surface2'
              }`}
              title="Weekly view"
            >
              <CalendarRange className="h-4 w-4 sm:mr-2 flex-shrink-0" />
              <span className="hidden sm:inline">Weekly</span>
            </button>
          </div>
        </div>
      </div>

      {/* Today's Schedule Widget */}
      <TodaysScheduleWidget
        lessons={todaysLessonsForWidget}
        onViewLesson={handleEdit}
        onCompleteLesson={handleComplete}
        getStudentName={getStudentName}
        getInstructorName={getInstructorName}
      />

      {/* Calendar View */}
      <div ref={calendarSectionRef}>
        {viewMode === 'calendar' && (
          <LessonsCalendarView
            ref={calendarRef}
            lessons={filteredLessons || []}
            availability={availabilityData || []}
            instructors={instructorsData?.data || []}
            onLessonClick={handleEdit}
            onAvailabilityClick={handleAvailabilityClick}
            getStudentName={getStudentName}
            getInstructorName={getInstructorName}
            searchTerm={searchTerm}
          />
        )}
      </div>

      {/* Weekly Schedule View */}
      <div ref={weeklySectionRef}>
        {viewMode === 'weekly' && (
          <InstructorWeeklySchedule
            ref={weeklyRef}
            onBookSlot={handleWeeklyBookSlot}
            onViewLesson={handleViewLessonFromWeekly}
          />
        )}
      </div>

      {/* Card View - mobile friendly */}
      <div ref={tableRef}>
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              <div className="col-span-full py-12">
                <LoadingSpinner />
              </div>
            ) : filteredLessons?.length === 0 ? (
              <div className="col-span-full">
                <EmptyState
                  icon={<CalendarDays className="h-12 w-12" />}
                  title="No lessons found"
                  description={
                    statusFilter !== 'all'
                      ? `No lessons match the selected filter.`
                      : searchTerm
                      ? `No lessons match your search for "${searchTerm}"`
                      : "Get started by scheduling your first lesson"
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => setIsSmartBookingOpen(true)}
                      className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary transition-colors"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Schedule Lesson
                    </button>
                  }
                />
              </div>
            ) : (
              filteredLessons?.sort(sortByDateTime).map((lesson) => {
                const upcoming = isUpcoming(lesson);
                return (
                  <div
                    key={lesson.id}
                    onClick={() => handleEdit(lesson)}
                    className={`bg-surface rounded-xl shadow-sm border-2 p-5 hover:shadow-md transition-all cursor-pointer ${
                      upcoming ? 'border-status-warning-border bg-status-warning-bg' :
                      lesson.status === 'completed' ? 'border-status-success-border' :
                      lesson.status === 'cancelled' ? 'border-status-danger-border' :
                      'border-edge hover:brightness-110 hover:border-primary'
                    }`}
                  >
                    {/* Header - Date & Status */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${upcoming ? 'bg-status-warning-bg' : 'bg-status-info-bg'}`}>
                          <Clock className={`h-4 w-4 ${upcoming ? 'text-status-warning-text' : 'text-primary'}`} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-tx-primary">
                            {formatDate(lesson.date)}
                          </div>
                          <div className="text-xs text-tx-muted">
                            {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {(() => {
                          const badge = (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${getStatusColor(lesson.status)}`}
                            >
                              {lesson.status === 'scheduled' && <Clock className="h-3 w-3 mr-1" />}
                              {lesson.status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                              {lesson.status === 'cancelled' && <X className="h-3 w-3 mr-1" />}
                              {lesson.status === 'no_show' && <AlertCircle className="h-3 w-3 mr-1" />}
                              {lesson.status.replace(/_/g, ' ')}
                            </span>
                          );
                          return lesson.status === 'scheduled' ? (
                            <StatusMenu
                              trigger={badge}
                              onComplete={() => handleComplete(lesson.id)}
                              onNoShow={() => handleNoShow(lesson.id)}
                              onCancel={() => handleCancel(lesson.id)}
                            />
                          ) : (
                            badge
                          );
                        })()}
                        {upcoming && (
                          <span className="inline-flex items-center rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-medium text-status-warning-text animate-pulse">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Soon
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Student & Instructor */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                          {getStudentName(lesson.studentId).split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-tx-primary truncate">{getStudentName(lesson.studentId)}</div>
                          <div className="text-xs text-tx-muted">Student</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                          {getInstructorName(lesson.instructorId).split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-tx-primary truncate">{getInstructorName(lesson.instructorId)}</div>
                          <div className="text-xs text-tx-muted">Instructor</div>
                        </div>
                      </div>
                    </div>

                    {/* Pickup Location & Type */}
                    <div className="space-y-2 mb-4 text-sm">
                      {lesson.pickupAddress && (
                        <div className="flex items-start gap-2 text-tx-secondary">
                          <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5 text-tx-muted" />
                          <span className="truncate" title={lesson.pickupAddress}>{lesson.pickupAddress}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-surface2 text-tx-secondary capitalize">
                          {lesson.lessonType.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-edge">
                      {lesson.status === 'scheduled' && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleComplete(lesson.id);
                            }}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-status-success-text text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Complete
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(lesson);
                            }}
                            className="p-2 text-tx-secondary hover:text-primary hover:bg-status-info-bg rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(lesson.id);
                            }}
                            className="p-2 text-tx-secondary hover:text-status-danger-text hover:bg-status-danger-bg rounded-lg transition-colors"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {lesson.status === 'cancelled' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReschedule(lesson);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 hover:bg-primary transition-colors"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Reschedule
                        </button>
                      )}
                      {lesson.status !== 'scheduled' && lesson.status !== 'cancelled' && (
                        <span className="text-tx-muted text-sm italic w-full text-center">No actions available</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Table View */}
      <div>
        {viewMode === 'table' && (
          <div className="rounded-xl bg-surface shadow-sm border border-edge overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-edge">
            <thead className="bg-surface2/80">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  Date & Time
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  Instructor
                </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                Pickup Location
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                Type
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary hidden lg:table-cell">
                History
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge bg-surface">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-12">
                  <LoadingSpinner />
                </td>
              </tr>
            ) : filteredLessons?.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-2">
                  <EmptyState
                    icon={<CalendarDays className="h-12 w-12" />}
                    title="No lessons found"
                    description={
                      statusFilter !== 'all'
                        ? `No lessons match the selected filter. Try changing the filter or schedule a new lesson.`
                        : searchTerm
                        ? `No lessons match your search for "${searchTerm}"`
                        : "Get started by scheduling your first lesson"
                    }
                    action={
                      <button
                        type="button"
                        onClick={() => setIsSmartBookingOpen(true)}
                        className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary transition-colors"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Schedule Lesson
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              <>
                {/* Today's Lessons */}
                {groupedLessons?.today && groupedLessons.today.length > 0 && (
                  <>
                    <tr className="bg-status-info-bg">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-primary" />
                          <h3 className="text-sm font-semibold text-status-info-text">Today</h3>
                          <span className="ml-2 px-2 py-0.5 bg-status-info-bg text-status-info-text text-xs font-medium rounded-full">
                            {groupedLessons.today.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {groupedLessons.today.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}

                {/* Tomorrow's Lessons */}
                {groupedLessons?.tomorrow && groupedLessons.tomorrow.length > 0 && (
                  <>
                    <tr className="bg-status-success-bg">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-status-success-text" />
                          <h3 className="text-sm font-semibold text-status-success-text">Tomorrow</h3>
                          <span className="ml-2 px-2 py-0.5 bg-status-success-bg text-status-success-text text-xs font-medium rounded-full">
                            {groupedLessons.tomorrow.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {groupedLessons.tomorrow.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}

                {/* This Week's Lessons */}
                {groupedLessons?.thisWeek && groupedLessons.thisWeek.length > 0 && (
                  <>
                    <tr className="bg-gradient-to-r from-purple-50 to-purple-100/50">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <CalendarRange className="h-4 w-4 text-purple-600" />
                          <h3 className="text-sm font-semibold text-purple-900">This Week</h3>
                          <span className="ml-2 px-2 py-0.5 bg-purple-200 text-purple-800 text-xs font-medium rounded-full">
                            {groupedLessons.thisWeek.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {groupedLessons.thisWeek.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}

                {/* Later Lessons */}
                {groupedLessons?.later && groupedLessons.later.length > 0 && (
                  <>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-tx-secondary" />
                          <h3 className="text-sm font-semibold text-tx-secondary">Later</h3>
                          <span className="ml-2 px-2 py-0.5 bg-surface3 text-tx-secondary text-xs font-medium rounded-full">
                            {groupedLessons.later.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {groupedLessons.later.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}

                {/* Past Lessons */}
                {groupedLessons?.past && groupedLessons.past.length > 0 && (
                  <>
                    <tr className="bg-gradient-to-r from-gray-100 to-gray-200/50">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-tx-muted" />
                          <h3 className="text-sm font-semibold text-tx-secondary">Past</h3>
                          <span className="ml-2 px-2 py-0.5 bg-surface3 text-tx-secondary text-xs font-medium rounded-full">
                            {groupedLessons.past.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {groupedLessons.past.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
          </div>
        </div>
      )}
      </div>

      {/* Pagination - Only show in table view */}
      {viewMode === 'table' && data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 shadow-sm border border-edge">
          <div className="text-sm text-tx-secondary">
            {filteredLessons?.length} of {data.pagination.total} lessons
            {statusFilter !== 'all' && <span className="text-tx-muted ml-1">(filtered)</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-tx-muted">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-tx-secondary hover:bg-surface2 disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === data.pagination.totalPages}
                className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-tx-secondary hover:bg-surface2 disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LessonModal - for quick edits */}
      {isModalOpen && (
        <LessonModal
          lesson={selectedLesson}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedLesson(null);
          }}
        />
      )}

      {/* SmartBookingForm - for new bookings */}
      {isSmartBookingOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <SmartBookingForm
              preselectedInstructor={
                preselectedInstructorId
                  ? instructorsData?.data?.find(i => i.id === preselectedInstructorId)
                  : undefined
              }
              preselectedStudent={
                preselectedStudentId
                  ? studentsData?.data?.find(s => s.id === preselectedStudentId)
                  : undefined
              }
              preselectedDate={preselectedDate || undefined}
              preselectedTime={preselectedTime || undefined}
              onBookingComplete={handleBookingComplete}
              onCancel={() => {
                setIsSmartBookingOpen(false);
                setPreselectedInstructorId(null);
                setPreselectedStudentId(null);
                setPreselectedDate(null);
                setPreselectedTime(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
    </div>
  );
};
