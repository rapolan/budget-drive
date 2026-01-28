import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit, X, CheckCircle, List, Calendar, RefreshCw, Trash2, CalendarDays, MapPin, Car as CarIcon, CalendarRange, Clock, Users, TrendingUp, AlertCircle } from 'lucide-react';
import { lessonsApi, studentsApi, instructorsApi, vehiclesApi, schedulingApi } from '@/api';
import type { Lesson, Instructor } from '@/types';
import { LessonModal } from '@/components/lessons/LessonModal';
import { LessonsCalendarView } from '@/components/lessons/LessonsCalendarView';
import { SmartBookingForm } from '@/components/scheduling/SmartBookingForm';
import { InstructorWeeklySchedule } from '@/components/scheduling/InstructorWeeklySchedule';
import { EmptyState, LoadingSpinner, FilterButton, BackButton, ToastContainer } from '@/components/common';
import { AuditColumn } from '@/components/common/AuditColumn';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useToast } from '@/hooks/useToast';

type ViewMode = 'table' | 'calendar' | 'weekly';
type StatusFilter = 'all' | 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export const LessonsPage: React.FC = () => {
  const location = useLocation();

  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();

  // Toast notifications
  const { toasts, success, removeToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmartBookingOpen, setIsSmartBookingOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('scheduled');
  const [preselectedInstructorId, setPreselectedInstructorId] = useState<string | null>(null);
  const [preselectedDate, setPreselectedDate] = useState<Date | null>(null);
  const [preselectedTime, setPreselectedTime] = useState<{ start: string; end: string } | null>(null);
  const [preselectedStudentId, setPreselectedStudentId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const tableRef = useRef<HTMLDivElement>(null);

  // Scroll to table with smooth animation (fallback to instant for reduced motion)
  const scrollToTable = () => {
    if (tableRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      tableRef.current.scrollIntoView({ 
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    }
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
  }, [location]);

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

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.getAll(),
  });

  // Fetch availability data for calendar view
  const { data: availabilityData } = useQuery({
    queryKey: ['availability', 'all'],
    queryFn: () => schedulingApi.getAllInstructorsAvailability(),
    enabled: viewMode === 'calendar', // Only fetch when in calendar view
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
    },
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.noShow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
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

  const handleDelete = async (id: string) => {
    if (window.confirm('Permanently delete this lesson? This cannot be undone.')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleCancel = async (id: string) => {
    if (window.confirm('Are you sure you want to cancel this lesson?')) {
      await cancelMutation.mutateAsync(id);
    }
  };

  const handleComplete = async (id: string) => {
    if (window.confirm('Mark this lesson as completed?')) {
      await completeMutation.mutateAsync(id);
      // Automatically filter to scheduled lessons after completing
      if (statusFilter === 'all') {
        setStatusFilter('scheduled');
      }
    }
  };

  const handleNoShow = async (id: string) => {
    if (window.confirm('Mark this lesson as no-show? The student did not arrive for their scheduled lesson.')) {
      await noShowMutation.mutateAsync(id);
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

  const handleBookingComplete = async (lessonId: string) => {
    setIsSmartBookingOpen(false);
    setPreselectedInstructorId(null);
    setPreselectedStudentId(null);
    setPreselectedDate(null);
    setPreselectedTime(null);
    // Invalidate and refetch all lesson queries immediately
    await queryClient.invalidateQueries({ queryKey: ['lessons'], refetchType: 'active' });
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

  const getVehicleInfo = (vehicleId: string) => {
    const vehicle = vehiclesData?.data?.find((v) => v.id === vehicleId);
    return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle';
  };

  // Helper to check if lesson is within 24 hours
  const isUpcoming = (lesson: Lesson) => {
    const now = new Date();
    const lessonDate = new Date(lesson.date);
    const [hours, minutes] = lesson.startTime.split(':');
    lessonDate.setHours(parseInt(hours), parseInt(minutes), 0);
    const diff = lessonDate.getTime() - now.getTime();
    return diff > 0 && diff <= 24 * 60 * 60 * 1000 && lesson.status === 'scheduled';
  };

  // Calculate status counts for filter buttons
  const statusCounts = React.useMemo(() => {
    const counts = {
      all: data?.data?.length || 0,
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
    data?.data?.forEach((lesson) => {
      if (lesson.status === 'scheduled') counts.scheduled++;
      else if (lesson.status === 'completed') counts.completed++;
      else if (lesson.status === 'cancelled') counts.cancelled++;
      else if (lesson.status === 'no_show') counts.no_show++;
    });
    return counts;
  }, [data?.data]);

  // Calculate stats for dashboard cards
  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    let todayLessons = 0;
    let upcomingToday = 0;
    let thisWeekLessons = 0;
    let completedThisMonth = 0;
    let totalHoursThisMonth = 0;

    data?.data?.forEach((lesson) => {
      const lessonDate = new Date(lesson.date);
      const lessonDay = new Date(lessonDate.getFullYear(), lessonDate.getMonth(), lessonDate.getDate());

      // Today's lessons
      if (lessonDay.getTime() === today.getTime()) {
        todayLessons++;
        if (lesson.status === 'scheduled') {
          const [hours, minutes] = lesson.startTime.split(':');
          const lessonTime = new Date(today);
          lessonTime.setHours(parseInt(hours), parseInt(minutes), 0);
          if (lessonTime > now) {
            upcomingToday++;
          }
        }
      }

      // This week's lessons (scheduled only)
      if (lessonDay >= weekStart && lessonDay < weekEnd && lesson.status === 'scheduled') {
        thisWeekLessons++;
      }

      // Completed this month
      if (lessonDay >= monthStart && lessonDay <= monthEnd && lesson.status === 'completed') {
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
  }, [data?.data]);

  const filteredLessons = data?.data?.filter((lesson) => {
    // Status filter
    if (statusFilter !== 'all' && lesson.status !== statusFilter) {
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
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'no_show':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
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

  // Group lessons by date category
  const groupLessonsByDate = (lessons: Lesson[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const groups = {
      today: [] as Lesson[],
      tomorrow: [] as Lesson[],
      thisWeek: [] as Lesson[],
      later: [] as Lesson[],
      past: [] as Lesson[],
    };

    lessons.forEach((lesson) => {
      const lessonDate = new Date(lesson.date);
      const lessonDay = new Date(lessonDate.getFullYear(), lessonDate.getMonth(), lessonDate.getDate());

      if (lessonDay.getTime() === today.getTime()) {
        groups.today.push(lesson);
      } else if (lessonDay.getTime() === tomorrow.getTime()) {
        groups.tomorrow.push(lesson);
      } else if (lessonDay > tomorrow && lessonDay <= nextWeek) {
        groups.thisWeek.push(lesson);
      } else if (lessonDay > nextWeek) {
        groups.later.push(lesson);
      } else {
        groups.past.push(lesson);
      }
    });

    return groups;
  };

  const groupedLessons = React.useMemo(() => {
    if (!filteredLessons) return null;
    return groupLessonsByDate(filteredLessons);
  }, [filteredLessons]);

  // Reusable function to render a lesson row
  const renderLessonRow = (lesson: Lesson) => {
    const upcoming = isUpcoming(lesson);
    return (
      <tr
        key={lesson.id}
        className={`hover:bg-gray-50 transition-colors cursor-pointer ${upcoming ? 'border-l-4 border-l-amber-400 bg-amber-50/50' : ''}`}
        onClick={() => handleEdit(lesson)}
      >
        <td className="whitespace-nowrap px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${upcoming ? 'bg-amber-100' : 'bg-blue-50'}`}>
              <Clock className={`h-4 w-4 ${upcoming ? 'text-amber-600' : 'text-blue-600'}`} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">
                {formatDate(lesson.date)}
              </div>
              <div className="text-sm text-gray-500">
                {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
              </div>
            </div>
            {upcoming && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 animate-pulse">
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
            <div className="text-sm font-medium text-gray-900">{getStudentName(lesson.studentId)}</div>
          </div>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
              {getInstructorName(lesson.instructorId).split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="text-sm text-gray-900">{getInstructorName(lesson.instructorId)}</div>
          </div>
        </td>
        <td className="px-6 py-4">
          {lesson.pickupAddress ? (
            <div className="flex items-start gap-2 max-w-xs">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-600 truncate" title={lesson.pickupAddress}>
                {lesson.pickupAddress}
              </div>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">Not specified</span>
          )}
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 capitalize">
            {lesson.lessonType.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
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
        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
          <div className="flex justify-end space-x-1">
            {lesson.status === 'scheduled' && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(lesson);
                  }}
                  className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all hover:scale-110"
                  title="Edit lesson"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleComplete(lesson.id);
                  }}
                  className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-all hover:scale-110"
                  title="Mark as completed"
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNoShow(lesson.id);
                  }}
                  className="p-2 text-orange-600 hover:text-orange-900 hover:bg-orange-50 rounded-lg transition-all hover:scale-110"
                  title="Mark as no-show"
                >
                  <AlertCircle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel(lesson.id);
                  }}
                  className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-all hover:scale-110"
                  title="Cancel lesson"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
            {lesson.status === 'cancelled' && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReschedule(lesson);
                  }}
                  className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all hover:scale-110"
                  title="Reschedule lesson"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(lesson.id);
                  }}
                  className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-all hover:scale-110"
                  title="Delete lesson"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
            {lesson.status !== 'scheduled' && lesson.status !== 'cancelled' && (
              <span className="text-gray-400 text-xs italic">—</span>
            )}
          </div>
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
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">Lessons</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage driving lessons and appointments
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* View Toggle */}
          <div className="flex rounded-lg border border-gray-300 bg-white overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium transition-all flex-1 sm:flex-initial ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <List className="mr-2 h-4 w-4 flex-shrink-0" />
              Table
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium transition-all flex-1 sm:flex-initial ${
                viewMode === 'calendar'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Calendar className="mr-2 h-4 w-4 flex-shrink-0" />
              Month
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium transition-all flex-1 sm:flex-initial ${
                viewMode === 'weekly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <CalendarRange className="mr-2 h-4 w-4 flex-shrink-0" />
              Weekly
            </button>
          </div>

          <button
            onClick={handleAddNew}
            className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
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
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('scheduled')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            {stats.upcomingToday > 0 && (
              <span className="flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                <Clock className="h-3 w-3 mr-1" />
                {stats.upcomingToday} upcoming
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{stats.todayLessons}</p>
            <p className="text-sm text-gray-500">Today's Lessons</p>
          </div>
        </div>

        {/* This Week */}
        <div 
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
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
            <p className="text-2xl font-bold text-gray-900">{stats.thisWeekLessons}</p>
            <p className="text-sm text-gray-500">Scheduled This Week</p>
          </div>
        </div>

        {/* Completed This Month */}
        <div 
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('completed')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
              {stats.totalHoursThisMonth} hrs
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{stats.completedThisMonth}</p>
            <p className="text-sm text-gray-500">Completed This Month</p>
          </div>
        </div>

        {/* Active Bookings */}
        <div 
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('scheduled')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{statusCounts.scheduled}</p>
            <p className="text-sm text-gray-500">Active Bookings</p>
          </div>
        </div>
      </div>

      {/* Search - Show in both views */}
      <div className="flex items-center rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
        <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
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
          className="ml-3 flex-1 border-none bg-transparent outline-none text-gray-900 placeholder-gray-400"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Status Filter - Only show in table view */}
      {viewMode === 'table' && (
        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <span className="text-sm font-medium text-gray-700">Status:</span>
          <div className="flex flex-wrap gap-2">
            <FilterButton
              label="All"
              isActive={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
              count={statusCounts.all}
              variant="default"
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
          </div>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <LessonsCalendarView
          lessons={filteredLessons || []}
          availability={availabilityData || []}
          instructors={instructorsData?.data || []}
          onLessonClick={handleEdit}
          onAvailabilityClick={handleAvailabilityClick}
          getStudentName={getStudentName}
          getInstructorName={getInstructorName}
        />
      )}

      {/* Weekly Schedule View */}
      {viewMode === 'weekly' && (
        <InstructorWeeklySchedule
          onBookSlot={handleWeeklyBookSlot}
          onViewLesson={handleViewLessonFromWeekly}
        />
      )}

      {/* Table View - scroll target */}
      <div ref={tableRef}>
        {viewMode === 'table' && (
          <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/80">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Date & Time
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Instructor
                </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Pickup Location
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Type
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 hidden lg:table-cell">
                History
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-12">
                  <LoadingSpinner />
                </td>
              </tr>
            ) : filteredLessons?.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-2">
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
                        className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
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
                    <tr className="bg-gradient-to-r from-blue-50 to-blue-100/50">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-blue-600" />
                          <h3 className="text-sm font-semibold text-blue-900">Today</h3>
                          <span className="ml-2 px-2 py-0.5 bg-blue-200 text-blue-800 text-xs font-medium rounded-full">
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
                    <tr className="bg-gradient-to-r from-green-50 to-green-100/50">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-green-600" />
                          <h3 className="text-sm font-semibold text-green-900">Tomorrow</h3>
                          <span className="ml-2 px-2 py-0.5 bg-green-200 text-green-800 text-xs font-medium rounded-full">
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
                          <Clock className="h-4 w-4 text-gray-600" />
                          <h3 className="text-sm font-semibold text-gray-700">Later</h3>
                          <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-full">
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
                          <Clock className="h-4 w-4 text-gray-500" />
                          <h3 className="text-sm font-semibold text-gray-600">Past</h3>
                          <span className="ml-2 px-2 py-0.5 bg-gray-300 text-gray-600 text-xs font-medium rounded-full">
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
        <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow">
          <div className="text-sm text-gray-700">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === data.pagination.totalPages}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
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
    </div>
  );
};
