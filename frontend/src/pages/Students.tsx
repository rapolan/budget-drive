import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Calendar, CheckCircle, Users, LayoutGrid, LayoutList, Phone, Mail, UserCheck, AlertCircle, TrendingUp, GraduationCap, ChevronDown, X } from 'lucide-react';
import { studentsApi, lessonsApi } from '@/api';
import type { Student } from '@/types';
import { StudentModal } from '@/components/students/StudentModal';
import { SmartBookingFormV2 } from '@/components/scheduling/SmartBookingFormV2';
import { computeStudentStatus, getFollowupReason } from '@/utils/studentStatus';
import { EmptyState, LoadingSpinner, FilterButton, BackButton } from '@/components/common';
import { AuditColumn } from '@/components/common/AuditColumn';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

type StatusFilter = 'all' | 'enrolled' | 'active' | 'completed' | 'dropped' | 'suspended' | 'needs_attention';
type ViewMode = 'table' | 'cards';

export const StudentsPage: React.FC = () => {
  const location = useLocation();

  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmartBookingOpen, setIsSmartBookingOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentForBooking, setStudentForBooking] = useState<Student | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [comparisonMode, setComparisonMode] = useState<'month' | 'year'>('month');
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
    // Small delay to allow filter to apply before scrolling
    setTimeout(scrollToTable, 100);
  };

  // Check for filter from navigation state
  useEffect(() => {
    if (location.state?.filter === 'needs_attention') {
      setStatusFilter('needs_attention');
      // Scroll to table after filter is applied
      setTimeout(scrollToTable, 100);
    }
  }, [location.state]);

  const { data, isLoading } = useQuery({
    queryKey: ['students', currentPage],
    queryFn: () => studentsApi.getAll(currentPage, 50),
  });

  // Fetch all lessons to determine which students need followup
  const { data: lessonsData } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonsApi.getAll(1, 1000),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const markContactedMutation = useMutation({
    mutationFn: (id: string) =>
      studentsApi.update(id, { lastContactedAt: new Date() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const handleEdit = (student: Student) => {
    setSelectedStudent(student);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleAddNew = () => {
    setSelectedStudent(null);
    setIsModalOpen(true);
  };

  const handleBookLesson = (student: Student) => {
    setStudentForBooking(student);
    setIsSmartBookingOpen(true);
  };

  const handleBookingComplete = (_lessonId: string) => {
    setIsSmartBookingOpen(false);
    setStudentForBooking(null);
    queryClient.invalidateQueries({ queryKey: ['lessons'] });
  };

  const handleMarkAsContacted = async (id: string) => {
    await markContactedMutation.mutateAsync(id);
  };

  // Helper to get computed status for a student
  const getStudentStatus = (student: Student) => {
    const lessons = lessonsData?.data || [];
    return computeStudentStatus(student, lessons);
  };

  // Calculate status counts for filter buttons
  const statusCounts = React.useMemo(() => {
    const counts = {
      all: data?.data?.length || 0,
      enrolled: 0,
      active: 0,
      completed: 0,
      dropped: 0,
      suspended: 0,
      needs_attention: 0,
    };

    data?.data?.forEach((student) => {
      const statusInfo = getStudentStatus(student);

      // Count by computed status
      if (statusInfo.status === 'enrolled') counts.enrolled++;
      else if (statusInfo.status === 'active') counts.active++;
      else if (statusInfo.status === 'completed') counts.completed++;
      else if (statusInfo.status === 'dropped') counts.dropped++;
      else if (statusInfo.status === 'suspended') counts.suspended++;
      else if (statusInfo.status === 'needs_attention') counts.needs_attention++;
    });

    return counts;
  }, [data?.data, lessonsData?.data]);

  // Calculate additional stats for dashboard cards
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastYearSameMonthStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const lastYearSameMonthEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
    
    let newThisMonth = 0;
    let newLastMonth = 0;
    let newLastYearSameMonth = 0;
    let completedThisMonth = 0;
    let totalHoursCompleted = 0;
    let avgProgress = 0;

    data?.data?.forEach((student) => {
      const createdAt = new Date(student.createdAt);
      
      // This month
      if (createdAt >= monthStart) {
        newThisMonth++;
      }
      
      // Last month
      if (createdAt >= lastMonthStart && createdAt <= lastMonthEnd) {
        newLastMonth++;
      }
      
      // Same month last year
      if (createdAt >= lastYearSameMonthStart && createdAt <= lastYearSameMonthEnd) {
        newLastYearSameMonth++;
      }

      const statusInfo = getStudentStatus(student);
      if (statusInfo.status === 'completed') {
        const completedAt = student.updatedAt ? new Date(student.updatedAt) : createdAt;
        if (completedAt >= monthStart) {
          completedThisMonth++;
        }
      }

      totalHoursCompleted += student.totalHoursCompleted || 0;
      if ((student.hoursRequired ?? 0) > 0) {
        avgProgress += (student.totalHoursCompleted / (student.hoursRequired ?? 1)) * 100;
      }
    });

    const totalStudents = data?.data?.length || 0;
    avgProgress = totalStudents > 0 ? Math.round(avgProgress / totalStudents) : 0;
    
    // Calculate differences
    const diffVsLastMonth = newThisMonth - newLastMonth;
    const diffVsLastYear = newThisMonth - newLastYearSameMonth;

    return {
      newThisMonth,
      newLastMonth,
      newLastYearSameMonth,
      diffVsLastMonth,
      diffVsLastYear,
      completedThisMonth,
      totalHoursCompleted: Math.round(totalHoursCompleted * 10) / 10,
      avgProgress,
    };
  }, [data?.data]);

  const filteredStudents = data?.data?.filter((student) => {
    const statusInfo = getStudentStatus(student);

    // Status filter
    if (statusFilter !== 'all' && statusInfo.status !== statusFilter) {
      return false;
    }

    // Search filter
    return (
      student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.phone?.includes(searchTerm) ?? false)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enrolled':
        return 'bg-purple-100 text-purple-800';
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'dropped':
        return 'bg-gray-100 text-gray-800';
      case 'suspended':
        return 'bg-red-100 text-red-800';
      case 'permit_expired':
        return 'bg-orange-100 text-orange-800';
      case 'needs_attention':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">Students</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your driving school students
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddNew}
          className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
        >
          <Plus className="mr-2 h-5 w-5 flex-shrink-0" />
          Add Student
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* New Students This Month */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('all')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            {/* Comparison Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setComparisonMode(comparisonMode === 'month' ? 'year' : 'month');
              }}
              className={`flex items-center text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                (comparisonMode === 'month' ? stats.diffVsLastMonth : stats.diffVsLastYear) >= 0
                  ? 'text-green-600 bg-green-50 hover:bg-green-100'
                  : 'text-red-600 bg-red-50 hover:bg-red-100'
              }`}
              title="Click to toggle comparison"
            >
              <TrendingUp className={`h-3 w-3 mr-1 ${
                (comparisonMode === 'month' ? stats.diffVsLastMonth : stats.diffVsLastYear) < 0 ? 'rotate-180' : ''
              }`} />
              {(comparisonMode === 'month' ? stats.diffVsLastMonth : stats.diffVsLastYear) >= 0 ? '+' : ''}
              {comparisonMode === 'month' ? stats.diffVsLastMonth : stats.diffVsLastYear}
              <ChevronDown className="h-3 w-3 ml-1" />
            </button>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{stats.newThisMonth}</p>
            <p className="text-sm text-gray-500">New This Month</p>
            <p className="text-xs text-gray-400 mt-1">
              vs {comparisonMode === 'month' ? 'last month' : 'last year'} ({comparisonMode === 'month' ? stats.newLastMonth : stats.newLastYearSameMonth})
            </p>
          </div>
        </div>

        {/* Active Students */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('active')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors">
              <UserCheck className="h-5 w-5 text-green-600" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{statusCounts.active}</p>
            <p className="text-sm text-gray-500">Active Students</p>
          </div>
        </div>

        {/* Needs Attention */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('needs_attention')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            {statusCounts.needs_attention > 0 && (
              <span className="flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full animate-pulse">
                Action needed
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{statusCounts.needs_attention}</p>
            <p className="text-sm text-gray-500">Need Attention</p>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('completed')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
              {stats.avgProgress}% avg
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-gray-900">{statusCounts.completed}</p>
            <p className="text-sm text-gray-500">Completed Training</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
        <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search students by name, email, or phone..."
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

      {/* Status Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          {/* View Toggle - Mobile only shows on the right */}
          <div className="flex items-center gap-1 sm:hidden">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
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
            label="Enrolled"
            isActive={statusFilter === 'enrolled'}
            onClick={() => setStatusFilter('enrolled')}
            count={statusCounts.enrolled}
            variant="secondary"
          />
          <FilterButton
            label="Active"
            isActive={statusFilter === 'active'}
            onClick={() => setStatusFilter('active')}
            count={statusCounts.active}
            variant="success"
          />
          <FilterButton
            label="Needs Attention"
            isActive={statusFilter === 'needs_attention'}
            onClick={() => setStatusFilter('needs_attention')}
            count={statusCounts.needs_attention}
            variant="warning"
          />
          <FilterButton
            label="Completed"
            isActive={statusFilter === 'completed'}
            onClick={() => setStatusFilter('completed')}
            count={statusCounts.completed}
            variant="info"
          />
          {/* Desktop view toggle */}
          <div className="hidden sm:flex items-center gap-1 ml-auto border-l pl-3">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Students List - scroll target */}
      <div ref={tableRef}>
        {/* Card View */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full py-12">
              <LoadingSpinner />
            </div>
          ) : filteredStudents?.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={<Users className="h-12 w-12" />}
                title="No students found"
                description={
                  statusFilter !== 'all'
                    ? `No students match the selected filter.`
                    : searchTerm
                    ? `No students match your search for "${searchTerm}"`
                    : "Get started by adding your first student"
                }
                action={
                  <button
                    type="button"
                    onClick={handleAddNew}
                    className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Student
                  </button>
                }
              />
            </div>
          ) : (
            filteredStudents?.map((student) => {
              const statusInfo = getStudentStatus(student);
              const progressPercent = (student.hoursRequired ?? 0) > 0
                ? Math.min(100, (student.totalHoursCompleted / (student.hoursRequired ?? 1)) * 100)
                : 0;
              
              return (
                <div
                  key={student.id}
                  className={`bg-white rounded-xl shadow-sm border-2 p-5 hover:shadow-md transition-all ${
                    statusInfo.status === 'needs_attention' ? 'border-amber-300' : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{student.fullName}</h3>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(statusInfo.status)}`}>
                          {statusInfo.displayStatus}
                        </span>
                      </div>
                    </div>
                    {statusInfo.status === 'needs_attention' && (
                      <span className="flex-shrink-0 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                        Needs Attention
                      </span>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600">Progress</span>
                      <span className="font-medium text-gray-900">
                        {student.totalHoursCompleted}/{student.hoursRequired || 6} hrs
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progressPercent >= 100 ? 'bg-green-500' : progressPercent >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2 mb-4 text-sm">
                    <a href={`mailto:${student.email}`} className="flex items-center gap-2 text-gray-600 hover:text-blue-600 truncate">
                      <Mail className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{student.email}</span>
                    </a>
                    <a href={`tel:${student.phone}`} className="flex items-center gap-2 text-gray-600 hover:text-blue-600">
                      <Phone className="h-4 w-4 flex-shrink-0" />
                      {student.phone}
                    </a>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => handleBookLesson(student)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Calendar className="h-4 w-4" />
                      Book
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(student)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    {statusInfo.status === 'needs_attention' && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsContacted(student.id)}
                        className="p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Mark as contacted"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-gray-100">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/80">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 hidden md:table-cell">
                  Contact
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Progress
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 hidden lg:table-cell">
                  History
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 min-w-[120px]">
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
              ) : filteredStudents?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-2">
                    <EmptyState
                      icon={<Users className="h-12 w-12" />}
                      title="No students found"
                      description={
                        statusFilter !== 'all'
                          ? `No students match the selected filter. Try changing the filter or add a new student.`
                          : searchTerm
                          ? `No students match your search for "${searchTerm}"`
                          : "Get started by adding your first student"
                      }
                      action={
                        <button
                          type="button"
                          onClick={handleAddNew}
                          className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Student
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredStudents?.map((student) => {
                  const statusInfo = getStudentStatus(student);
                  const progressPercent = (student.hoursRequired ?? 0) > 0
                    ? Math.min(100, (student.totalHoursCompleted / (student.hoursRequired ?? 1)) * 100)
                    : 0;
                  
                  return (
                    <tr key={student.id} className={`hover:bg-gray-50 cursor-pointer ${statusInfo.status === 'needs_attention' ? 'bg-amber-50/50' : ''}`} onClick={() => handleEdit(student)}>
                      {/* Student Name with Avatar */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                            {student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{student.fullName}</div>
                            <div className="text-sm text-gray-500 md:hidden truncate">{student.email}</div>
                          </div>
                        </div>
                      </td>
                      {/* Contact - Hidden on mobile */}
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="text-sm text-gray-900">{student.email}</div>
                        <div className="text-sm text-gray-500">{student.phone}</div>
                      </td>
                      {/* Status - hover for reason */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-semibold cursor-help ${getStatusColor(statusInfo.status)}`}
                            title={statusInfo.status === 'needs_attention'
                              ? getFollowupReason(student, lessonsData?.data || [])
                              : statusInfo.reason}
                          >
                            {statusInfo.displayStatus}
                          </span>
                        </div>
                      </td>
                      {/* Progress with visual bar */}
                      <td className="px-6 py-4">
                        <div className="w-32">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-gray-900">
                              {student.totalHoursCompleted}/{student.hoursRequired || 6} hrs
                            </span>
                            <span className="text-gray-500">{Math.round(progressPercent)}%</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                progressPercent >= 100 ? 'bg-green-500' : progressPercent >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      {/* History - Hidden on mobile */}
                      <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                        <AuditColumn
                          createdByName={student.createdByName}
                          updatedByName={student.updatedByName}
                          createdAt={student.createdAt}
                          updatedAt={student.updatedAt}
                        />
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          {statusInfo.status === 'needs_attention' && (
                            <button
                              type="button"
                              onClick={() => handleMarkAsContacted(student.id)}
                              className="p-2 text-amber-600 hover:text-amber-900 hover:bg-amber-50 rounded-lg transition-all hover:scale-110"
                              title="Mark as contacted"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBookLesson(student);
                            }}
                            className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-all hover:scale-110"
                            title="Book lesson"
                          >
                            <Calendar className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(student);
                            }}
                            className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all hover:scale-110"
                            title="Edit student"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(student.id);
                            }}
                            className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-all hover:scale-110"
                            title="Delete student"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow">
          <div className="text-sm text-gray-700">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === data.pagination.totalPages}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Student Modal */}
      {isModalOpen && (
        <StudentModal
          student={selectedStudent}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedStudent(null);
          }}
          onBookLesson={handleBookLesson}
        />
      )}

      {/* SmartBookingForm - for booking lessons */}
      {isSmartBookingOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <SmartBookingFormV2
              preselectedStudent={studentForBooking || undefined}
              onBookingComplete={handleBookingComplete}
              onCancel={() => {
                setIsSmartBookingOpen(false);
                setStudentForBooking(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
