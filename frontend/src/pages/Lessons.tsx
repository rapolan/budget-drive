import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit, X, CheckCircle, List, Calendar, RefreshCw, Trash2, CalendarDays, MapPin, Car as CarIcon } from 'lucide-react';
import { lessonsApi, studentsApi, instructorsApi, vehiclesApi, schedulingApi } from '@/api';
import type { Lesson } from '@/types';
import { LessonModal } from '@/components/lessons/LessonModal';
import { LessonsCalendarView } from '@/components/lessons/LessonsCalendarView';
import { SmartBookingForm } from '@/components/scheduling/SmartBookingForm';
import { EmptyState, LoadingSpinner, FilterButton } from '@/components/common';

type ViewMode = 'table' | 'calendar';
type StatusFilter = 'all' | 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export const LessonsPage: React.FC = () => {
  const location = useLocation();
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

  // Handle navigation state to open SmartBooking
  useEffect(() => {
    if (location.state?.openSmartBooking) {
      setIsSmartBookingOpen(true);
      // Clear the state after opening
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
    queryFn: async () => {
      console.log('=== FETCHING ALL INSTRUCTORS AVAILABILITY ===');
      const result = await schedulingApi.getAllInstructorsAvailability();
      console.log('API Result:', result);
      console.log('Result is array?', Array.isArray(result));
      console.log('Result length:', result?.length);
      return result;
    },
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

  const handleBookingComplete = (lessonId: string) => {
    setIsSmartBookingOpen(false);
    setPreselectedInstructorId(null);
    setPreselectedStudentId(null);
    setPreselectedDate(null);
    setPreselectedTime(null);
    queryClient.invalidateQueries({ queryKey: ['lessons'] });
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
        className={`hover:bg-gray-50 ${upcoming ? 'border-l-4 border-l-yellow-400 bg-yellow-50' : ''}`}
      >
        <td className="whitespace-nowrap px-6 py-4">
          <div className="flex items-center gap-2">
            <div>
              <div className="text-sm font-medium text-gray-900">
                {formatDate(lesson.date)}
              </div>
              <div className="text-sm text-gray-500">
                {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
              </div>
            </div>
            {upcoming && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                Soon
              </span>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <div className="text-sm text-gray-900">{getStudentName(lesson.studentId)}</div>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <div className="text-sm text-gray-900">{getInstructorName(lesson.instructorId)}</div>
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
            <span className="text-sm text-gray-400">Not specified</span>
          )}
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          {lesson.vehicleId ? (
            <div className="flex items-center gap-2">
              <CarIcon className="h-4 w-4 text-gray-400" />
              <div className="text-sm text-gray-900">{getVehicleInfo(lesson.vehicleId)}</div>
            </div>
          ) : (
            <span className="text-sm text-gray-400">Not assigned</span>
          )}
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <div className="text-sm text-gray-900 capitalize">
            {lesson.lessonType.replace(/_/g, ' ')}
          </div>
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <span
            className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 capitalize ${getStatusColor(
              lesson.status
            )}`}
          >
            {lesson.status.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
          <div className="flex justify-end space-x-2">
            {lesson.status === 'scheduled' && (
              <>
                <button
                  type="button"
                  onClick={() => handleEdit(lesson)}
                  className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                  title="Edit lesson"
                >
                  <Edit className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleComplete(lesson.id)}
                  className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded transition-colors"
                  title="Mark as completed"
                >
                  <CheckCircle className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleCancel(lesson.id)}
                  className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
                  title="Cancel lesson"
                >
                  <X className="h-5 w-5" />
                </button>
              </>
            )}
            {lesson.status === 'cancelled' && (
              <>
                <button
                  type="button"
                  onClick={() => handleReschedule(lesson)}
                  className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                  title="Reschedule lesson"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(lesson.id)}
                  className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
                  title="Delete lesson"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </>
            )}
            {lesson.status !== 'scheduled' && lesson.status !== 'cancelled' && (
              <span className="text-gray-400 text-xs">No actions</span>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lessons</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage driving lessons and appointments
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* View Toggle */}
          <div className="flex rounded-md border border-gray-300 bg-white">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <List className="mr-2 h-4 w-4" />
              Table
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Calendar
            </button>
          </div>

          <button
            onClick={handleAddNew}
            className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="mr-2 h-5 w-5" />
            Book New Lesson
          </button>
        </div>
      </div>

      {/* Search - Show in both views */}
      <div className="flex items-center rounded-md border border-gray-300 bg-white px-4 py-2">
        <Search className="h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder={
            viewMode === 'calendar'
              ? "Filter by student, instructor, or type..."
              : "Search by student, instructor, type, or status..."
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ml-2 flex-1 border-none bg-transparent outline-none"
        />
      </div>

      {/* Status Filter - Only show in table view */}
      {viewMode === 'table' && (
        <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
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

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Date & Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Student
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Instructor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Pickup Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Vehicle
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
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
                    <tr className="bg-blue-50">
                      <td colSpan={8} className="px-6 py-3">
                        <h3 className="text-sm font-semibold text-blue-900">Today</h3>
                      </td>
                    </tr>
                    {groupedLessons.today.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}

                {/* Tomorrow's Lessons */}
                {groupedLessons?.tomorrow && groupedLessons.tomorrow.length > 0 && (
                  <>
                    <tr className="bg-green-50">
                      <td colSpan={8} className="px-6 py-3">
                        <h3 className="text-sm font-semibold text-green-900">Tomorrow</h3>
                      </td>
                    </tr>
                    {groupedLessons.tomorrow.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}

                {/* This Week's Lessons */}
                {groupedLessons?.thisWeek && groupedLessons.thisWeek.length > 0 && (
                  <>
                    <tr className="bg-purple-50">
                      <td colSpan={8} className="px-6 py-3">
                        <h3 className="text-sm font-semibold text-purple-900">This Week</h3>
                      </td>
                    </tr>
                    {groupedLessons.thisWeek.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}

                {/* Later Lessons */}
                {groupedLessons?.later && groupedLessons.later.length > 0 && (
                  <>
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-6 py-3">
                        <h3 className="text-sm font-semibold text-gray-700">Later</h3>
                      </td>
                    </tr>
                    {groupedLessons.later.map((lesson) => renderLessonRow(lesson))}
                  </>
                )}

                {/* Past Lessons */}
                {groupedLessons?.past && groupedLessons.past.length > 0 && (
                  <>
                    <tr className="bg-gray-100">
                      <td colSpan={8} className="px-6 py-3">
                        <h3 className="text-sm font-semibold text-gray-600">Past</h3>
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
    </div>
  );
};
