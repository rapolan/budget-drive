import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, UserCheck, Users, Calendar, TrendingUp, X, Mail, Phone, DollarSign, Clock, Briefcase } from 'lucide-react';
import { instructorsApi, lessonsApi } from '@/api';
import type { Instructor } from '@/types';
import { InstructorModal } from '@/components/instructors/InstructorModal';
import { EmptyState, LoadingSpinner, FilterButton, BackButton } from '@/components/common';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

type StatusFilter = 'all' | 'active' | 'on_leave' | 'terminated';

export const InstructorsPage: React.FC = () => {
  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const queryClient = useQueryClient();
  const tableRef = useRef<HTMLDivElement>(null);

  // Scroll to table with smooth animation
  const scrollToTable = () => {
    if (tableRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      tableRef.current.scrollIntoView({ 
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  };

  // Handle stat card click
  const handleStatCardClick = (filter: StatusFilter) => {
    setStatusFilter(filter);
    setTimeout(scrollToTable, 100);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  // Fetch lessons to calculate stats
  const { data: lessonsData } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonsApi.getAll(1, 1000),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => instructorsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
    },
  });

  const handleEdit = (instructor: Instructor) => {
    setSelectedInstructor(instructor);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this instructor?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleAddNew = () => {
    setSelectedInstructor(null);
    setIsModalOpen(true);
  };

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts = {
      all: data?.data?.length || 0,
      active: 0,
      on_leave: 0,
      terminated: 0,
    };

    data?.data?.forEach((instructor) => {
      if (instructor.status === 'active') counts.active++;
      else if (instructor.status === 'on_leave') counts.on_leave++;
      else if (instructor.status === 'terminated') counts.terminated++;
    });

    return counts;
  }, [data?.data]);

  // Calculate stats for dashboard cards
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let totalLessonsThisMonth = 0;
    let totalHoursThisMonth = 0;
    const instructorLessonCounts: Record<string, number> = {};

    lessonsData?.data?.forEach((lesson) => {
      const lessonDate = new Date(lesson.date);
      if (lessonDate >= monthStart && lesson.status === 'completed') {
        totalLessonsThisMonth++;
        
        // Count by instructor
        instructorLessonCounts[lesson.instructorId] = (instructorLessonCounts[lesson.instructorId] || 0) + 1;
        
        // Calculate hours
        const [startH, startM] = lesson.startTime.split(':').map(Number);
        const [endH, endM] = lesson.endTime.split(':').map(Number);
        const hours = (endH - startH) + (endM - startM) / 60;
        totalHoursThisMonth += hours;
      }
    });

    // Find top performer
    let topInstructorId = '';
    let topLessonCount = 0;
    Object.entries(instructorLessonCounts).forEach(([id, count]) => {
      if (count > topLessonCount) {
        topInstructorId = id;
        topLessonCount = count;
      }
    });

    const topInstructor = data?.data?.find(i => i.id === topInstructorId);

    // Calculate average hourly rate
    const activeInstructors = data?.data?.filter(i => i.status === 'active' && i.hourlyRate) || [];
    const avgHourlyRate = activeInstructors.length > 0
      ? activeInstructors.reduce((sum, i) => sum + Number(i.hourlyRate || 0), 0) / activeInstructors.length
      : 0;

    return {
      totalLessonsThisMonth,
      totalHoursThisMonth: Math.round(totalHoursThisMonth * 10) / 10,
      topInstructor: topInstructor?.fullName || 'N/A',
      topLessonCount,
      avgHourlyRate: avgHourlyRate.toFixed(2),
    };
  }, [data?.data, lessonsData?.data]);

  const filteredInstructors = data?.data?.filter((instructor) => {
    // Status filter
    if (statusFilter !== 'all' && instructor.status !== statusFilter) {
      return false;
    }

    // Search filter
    return (
      instructor.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.phone.includes(searchTerm)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'on_leave':
        return 'bg-yellow-100 text-yellow-800';
      case 'terminated':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getEmploymentTypeLabel = (type: string) => {
    switch (type) {
      case 'w2_employee':
        return 'W2 Employee';
      case '1099_contractor':
        return '1099 Contractor';
      case 'volunteer':
        return 'Volunteer';
      default:
        return type;
    }
  };

  const getEmploymentTypeColor = (type: string) => {
    switch (type) {
      case 'w2_employee':
        return 'bg-blue-50 text-blue-700';
      case '1099_contractor':
        return 'bg-purple-50 text-purple-700';
      case 'volunteer':
        return 'bg-green-50 text-green-700';
      default:
        return 'bg-gray-50 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">Instructors</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your driving school instructors
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
        >
          <Plus className="mr-2 h-5 w-5 flex-shrink-0" />
          Add Instructor
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Instructors */}
        <div 
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('active')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors">
              <UserCheck className="h-5 w-5 text-green-600" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{statusCounts.active}</p>
            <p className="text-sm text-gray-500">Active Instructors</p>
          </div>
        </div>

        {/* Lessons This Month */}
        <div 
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('active')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
              {stats.totalHoursThisMonth} hrs
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{stats.totalLessonsThisMonth}</p>
            <p className="text-sm text-gray-500">Lessons This Month</p>
          </div>
        </div>

        {/* Top Performer */}
        <div 
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('active')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            {stats.topLessonCount > 0 && (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                {stats.topLessonCount} lessons
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-lg font-bold text-gray-900 truncate">{stats.topInstructor}</p>
            <p className="text-sm text-gray-500">Top Performer</p>
          </div>
        </div>

        {/* Average Rate */}
        <div 
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => handleStatCardClick('all')}
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">${stats.avgHourlyRate}</p>
            <p className="text-sm text-gray-500">Avg Hourly Rate</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
        <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
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

      {/* Status Filter */}
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
            label="Active"
            isActive={statusFilter === 'active'}
            onClick={() => setStatusFilter('active')}
            count={statusCounts.active}
            variant="success"
          />
          <FilterButton
            label="On Leave"
            isActive={statusFilter === 'on_leave'}
            onClick={() => setStatusFilter('on_leave')}
            count={statusCounts.on_leave}
            variant="warning"
          />
          <FilterButton
            label="Terminated"
            isActive={statusFilter === 'terminated'}
            onClick={() => setStatusFilter('terminated')}
            count={statusCounts.terminated}
            variant="danger"
          />
        </div>
      </div>

      {/* Table */}
      <div ref={tableRef} className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Instructor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Employment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Hourly Rate
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
                  <td colSpan={6} className="py-12">
                    <LoadingSpinner />
                  </td>
                </tr>
              ) : filteredInstructors?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-2">
                    <EmptyState
                      icon={<UserCheck className="h-12 w-12" />}
                      title="No instructors found"
                      description={
                        searchTerm
                          ? `No instructors match your search for "${searchTerm}"`
                          : statusFilter !== 'all'
                          ? `No ${statusFilter.replace('_', ' ')} instructors`
                          : "Get started by adding your first instructor"
                      }
                      action={
                        <button
                          type="button"
                          onClick={handleAddNew}
                          className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Instructor
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredInstructors?.map((instructor) => (
                  <tr key={instructor.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                          {instructor.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{instructor.fullName}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Hired {new Date(instructor.hireDate).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                          <Mail className="h-4 w-4 text-gray-400" />
                          {instructor.email}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Phone className="h-4 w-4 text-gray-400" />
                          {instructor.phone}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${getEmploymentTypeColor(instructor.employmentType)}`}>
                        <Briefcase className="h-3 w-3" />
                        {getEmploymentTypeLabel(instructor.employmentType)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {instructor.hourlyRate ? `${Number(instructor.hourlyRate).toFixed(2)}/hr` : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusColor(
                          instructor.status
                        )}`}
                      >
                        {instructor.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleEdit(instructor)}
                          className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all hover:scale-110"
                          title="Edit instructor"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(instructor.id)}
                          className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-all hover:scale-110"
                          title="Delete instructor"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <InstructorModal
          instructor={selectedInstructor}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedInstructor(null);
          }}
        />
      )}
    </div>
  );
};
