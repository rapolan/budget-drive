import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Calendar, CheckCircle, Users, LayoutGrid, LayoutList, Phone, Mail, UserCheck, AlertCircle, TrendingUp, GraduationCap, ChevronDown, X, ArrowUpDown } from 'lucide-react';
import { studentsApi, lessonsApi, dashboardApi, searchApi, guardiansApi, enrollmentsApi } from '@/api';
import type { Student, Guardian, LinkedStudent, Lesson } from '@/types';
import { StudentModal } from '@/components/students/StudentModal';
import { StudentProgressBar } from '@/components/students/StudentProgressBar';
import { StudentStatusBadge } from '@/components/students/StudentStatusBadge';
import type { GuardianPrefill } from '@/components/students/StudentModal';
import { SmartBookingForm } from '@/components/scheduling/SmartBookingForm';
import { GuardiansList } from '@/components/guardians/GuardiansList';
import { GuardianModal } from '@/components/guardians/GuardianModal';
import { UnifiedSearchResults } from '@/components/guardians/UnifiedSearchResults';
import { computeStudentStatus, getFollowupReason } from '@/utils/studentStatus';
import { getStudentContactDisplay } from '@/utils/studentContact';
import { bucketTimePreference } from '@/utils/timePreferenceBucket';
import { needsTurning18Alert } from '@/utils/turning18';
import { EmptyState, LoadingSpinner, FilterButton, BackButton } from '@/components/common';
import { AuditColumn } from '@/components/common/AuditColumn';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useDebounce } from '@/hooks/useDebounce';
import { useSessionState } from '@/hooks/useSessionState';
import { useTenant } from '@/contexts/TenantContext';
import { parseLocalDate } from '@/utils/timeFormat';

type StatusFilter = 'all' | 'new_this_month' | 'scheduled' | 'ready_to_book' | 'needs_attention' | 'completed' | 'inactive' | 'turning_18' | 'no_show_followup' | 'needs_guardian';
type ViewMode = 'table' | 'cards';
type SortOption = 'name' | 'enrollment_newest' | 'enrollment_oldest' | 'last_lesson' | 'progress';

// The gold-gradient treatment for the guided "Mark complete" action -
// reads as the positive milestone action, consistent with the gold star
// (StudentStatusBadge's "Ready to Complete" badge) and the gold
// certificate badge (EnrollmentSubPanel) elsewhere in the app. Token-
// driven (gold-gradient-from/to, defined in index.css/tailwind.config.js),
// never a hardcoded hex - reused at both icon-button call sites below.
const MARK_COMPLETE_BUTTON_CLASSES =
  'bg-gradient-to-br from-gold-gradient-from to-gold-gradient-to text-white shadow-sm hover:brightness-110 hover:scale-110 transition-all';
type ActiveView = 'students' | 'guardians';
const isViewMode = (v: string): v is ViewMode => v === 'table' || v === 'cards';
const isActiveView = (v: string): v is ActiveView => v === 'students' || v === 'guardians';

export const StudentsPage: React.FC = () => {
  const location = useLocation();
  const { tenantNow } = useTenant();
  // computeStudentStatus/getFollowupReason require an explicit
  // tenant-resolved "now" - falls back to a fixed placeholder only for the
  // brief pre-hydration window before TenantContext's first fetch resolves
  // (never the browser's own clock - see docs/ARCHITECTURE.md §7).
  const statusNow = tenantNow ? parseLocalDate(tenantNow.today) : new Date(0);

  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();
  const [activeView, setActiveView] = useSessionState<ActiveView>('students-active-view', 'students', isActiveView);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useSessionState<ViewMode>('students-view-mode', 'table', isViewMode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmartBookingOpen, setIsSmartBookingOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentForBooking, setStudentForBooking] = useState<Student | null>(null);
  // "Book again" prefill, derived from a student's most recent lesson -
  // undefined for the plain "Book Lesson" entry point, which passes none
  // of these and gets the wizard's normal blank setup step.
  const [bookAgainPrefill, setBookAgainPrefill] = useState<{
    instructorId: string;
    duration: number;
    lessonType: 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
    timePreference: 'any' | 'morning' | 'afternoon' | 'evening';
    pickupAddress: string;
  } | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [comparisonMode, setComparisonMode] = useState<'month' | 'year'>('month');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [isGuardianModalOpen, setIsGuardianModalOpen] = useState(false);
  const [selectedGuardian, setSelectedGuardian] = useState<Guardian | null>(null);
  const [guardianPrefill, setGuardianPrefill] = useState<GuardianPrefill | undefined>(undefined);
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
    if (
      location.state?.filter === 'needs_attention' ||
      location.state?.filter === 'turning_18' ||
      location.state?.filter === 'no_show_followup' ||
      location.state?.filter === 'needs_guardian'
    ) {
      setStatusFilter(location.state.filter);
      // Scroll to table after filter is applied
      setTimeout(scrollToTable, 100);
    }
  }, [location.state]);

  const { data, isLoading } = useQuery({
    queryKey: ['students', currentPage],
    queryFn: () => studentsApi.getAll(currentPage, 50),
  });

  // Unified cross-type search: typing 2+ characters overlays mixed
  // student+guardian results regardless of the active tab (Constraint B -
  // renders exactly what the backend returns, no client re-ranking).
  const debouncedSearchTerm = useDebounce(searchTerm, 400);
  const isSearching = debouncedSearchTerm.trim().length >= 2;
  const { data: unifiedResults, isLoading: isUnifiedSearchLoading } = useQuery({
    queryKey: ['search', 'people', debouncedSearchTerm],
    queryFn: () => searchApi.people(debouncedSearchTerm),
    enabled: isSearching,
  });

  // No-show alert list depends on backend notification-dismissal state, not
  // purely derivable from already-fetched student/lesson data - only fetch
  // it when the filter is actually in use.
  const { data: noShowAlertsData } = useQuery({
    queryKey: ['dashboard', 'no-show-alerts'],
    queryFn: () => dashboardApi.getNoShowAlerts(),
    enabled: statusFilter === 'no_show_followup',
  });
  const noShowStudentIds = useMemo(
    () => new Set((noShowAlertsData?.data || []).map(a => a.studentId)),
    [noShowAlertsData]
  );

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

  // Reachable from the list once a student's active driver_training
  // enrollment has met its lesson/hours requirement (progress.percentComplete
  // >= 100 - read from computeStudentProgress's own output, never
  // recomputed here, per Constraint A/progressCalculationOwnership.test.ts).
  // Same guarded shape as StudentModal's own enrollment-tab "Mark complete"
  // flow: reveals an inline reason field, requires a non-empty reason
  // before the confirm button enables - completion is an audit-recorded
  // compliance event (it drives the certificate worklist), never a casual
  // toggle, so it deliberately does not fire on the first click alone.
  const [completingStudentId, setCompletingStudentId] = useState<string | null>(null);
  const [completionReason, setCompletionReason] = useState('');

  const completeEnrollmentMutation = useMutation({
    mutationFn: ({ enrollmentId, reason }: { enrollmentId: string; reason: string }) =>
      enrollmentsApi.complete(enrollmentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setCompletingStudentId(null);
      setCompletionReason('');
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
    setGuardianPrefill(undefined);
    setSelectedStudent(null);
    setIsModalOpen(true);
  };

  const handleGuardianSelect = (guardian: Guardian) => {
    setSelectedGuardian(guardian);
    setIsGuardianModalOpen(true);
  };

  const handleAddGuardian = () => {
    setSelectedGuardian(null);
    setIsGuardianModalOpen(true);
  };

  // Unified search result clicks - the matched record may not be on the
  // currently-loaded page, so fetch it directly by id rather than relying
  // on it already being present in already-fetched lists.
  const handleSelectSearchedStudent = async (id: string) => {
    const cached = data?.data?.find(s => s.id === id);
    if (cached) {
      setSelectedStudent(cached);
      setIsModalOpen(true);
      return;
    }
    const response = await studentsApi.getById(id);
    if (response.data) {
      setSelectedStudent(response.data);
      setIsModalOpen(true);
    }
  };

  const handleSelectSearchedGuardian = async (id: string) => {
    const response = await guardiansApi.getById(id);
    if (response.data) {
      handleGuardianSelect(response.data);
    }
  };

  // Guardian-first enrollment (the phone-call flow): carries over last
  // name, home address, emergency contacts, and pickup address from the
  // guardian's primary (or most-recent) linked student - guardians have no
  // address fields of their own. Explicitly does NOT carry over dateOfBirth,
  // permit details, or anything else student-specific.
  const handleEnrollAnother = (guardian: Guardian, primaryStudent: LinkedStudent | null) => {
    setGuardianPrefill({
      guardianId: guardian.id,
      lastName: guardian.lastName || primaryStudent?.lastName || undefined,
      addressLine1: primaryStudent?.addressLine1,
      addressLine2: primaryStudent?.addressLine2,
      city: primaryStudent?.city,
      state: primaryStudent?.state,
      zipCode: primaryStudent?.zipCode,
      emergencyContactFirstName: primaryStudent?.emergencyContactFirstName,
      emergencyContactLastName: primaryStudent?.emergencyContactLastName,
      emergencyContactPhone: primaryStudent?.emergencyContactPhone,
    });
    setIsGuardianModalOpen(false);
    setSelectedGuardian(null);
    setSelectedStudent(null);
    setIsModalOpen(true);
  };

  // The wizard's Lesson Type <select> only offers these four values, but
  // the DB's real CHECK constraint (a separate, pre-existing mismatch, not
  // introduced here) allows 'road_test_prep' instead of 'road_test' - a
  // historical lesson can carry a value the dropdown has no option for.
  // Falls back to the default rather than silently setting the <select>
  // to something it can't render as selected.
  const KNOWN_LESSON_TYPES = new Set(['behind_wheel', 'classroom', 'observation', 'road_test']);
  const toKnownLessonType = (value: string): 'behind_wheel' | 'classroom' | 'observation' | 'road_test' =>
    KNOWN_LESSON_TYPES.has(value) ? (value as 'behind_wheel' | 'classroom' | 'observation' | 'road_test') : 'behind_wheel';

  // Single booking entry point. When mostRecentLesson is provided (the
  // student has prior lesson history), prefills the wizard's setup step
  // from it - instructor stays a real, changeable selection (never
  // locked), the date range is left at its own default ("Next 2 Weeks"),
  // and the user still runs a fresh search rather than skipping ahead.
  // With no history, opens a plain blank booking (bookAgainPrefill stays
  // undefined). There is no separate "Book Again" entry point - prefill-
  // or-not is decided by lesson history alone.
  const handleBookLesson = (student: Student, mostRecentLesson: Lesson | null) => {
    setStudentForBooking(student);
    if (!mostRecentLesson) {
      setBookAgainPrefill(undefined);
      setIsSmartBookingOpen(true);
      return;
    }
    setBookAgainPrefill({
      instructorId: mostRecentLesson.instructorId,
      // Postgres numeric columns come back through the API as strings
      // (e.g. "60.00", not 60) - must coerce with Number() here or the
      // wizard's duration state initializes as that string, which
      // schedulingService's slot-generation arithmetic then silently
      // string-concatenates instead of adding, producing zero results.
      duration: Number(mostRecentLesson.duration),
      lessonType: toKnownLessonType(mostRecentLesson.lessonType),
      timePreference: bucketTimePreference(mostRecentLesson.startTime),
      pickupAddress: mostRecentLesson.pickupAddress || '',
    });
    setIsSmartBookingOpen(true);
  };

  const handleBookingComplete = (_lessonId: string) => {
    setIsSmartBookingOpen(false);
    setStudentForBooking(null);
    setBookAgainPrefill(undefined);
    queryClient.invalidateQueries({ queryKey: ['lessons'] });
  };

  const handleMarkAsContacted = async (id: string) => {
    await markContactedMutation.mutateAsync(id);
  };

  // Helper to get computed status for a student
  const getStudentStatus = (student: Student) => {
    const lessons = lessonsData?.data || [];
    return computeStudentStatus(student, lessons, statusNow, student.activeEnrollment ?? null);
  };

  // Eligible for the guided "Mark complete" action - an ACTIVE, not-yet-
  // completed driver_training enrollment, gated differently per track
  // (progress.track is read as already computed by computeStudentProgress;
  // never re-derived here, per Constraint A -
  // progressCalculationOwnership.test.ts enforces this for every display
  // file in this codebase, this one included):
  //   - HOURS track (minors, or an admin-pinned override): percentComplete
  //     is measured against the real DMV-required hours - an objective
  //     finish line, so the action auto-surfaces once it hits 100%.
  //   - LESSONS track (adults): lessonsRequired is defined as
  //     lessonsBooked itself, so no percentage ever means "finished" - an
  //     adult decides when they're done, not a computed milestone. The
  //     action is always available once they have at least one completed
  //     lesson, regardless of percentComplete.
  const isReadyToMarkComplete = (student: Student): boolean => {
    if (student.activeEnrollment?.status !== 'active' || student.activeEnrollment.completed) {
      return false;
    }
    if (student.progress?.track === 'hours') {
      return student.progress.percentComplete >= 100;
    }
    if (student.progress?.track === 'lessons') {
      return (student.progress.lessonsCompleted ?? 0) >= 1;
    }
    return false;
  };

  // Calculate status counts for filter buttons
  const statusCounts = React.useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const counts = {
      all: data?.data?.length || 0,
      new_this_month: 0,
      scheduled: 0,
      ready_to_book: 0,
      needs_attention: 0,
      completed: 0,
      inactive: 0,
      turning_18: 0,
      needs_guardian: 0,
    };

    counts.all = data?.data?.length || 0;

    data?.data?.forEach((student) => {
      const statusInfo = getStudentStatus(student);
      const createdAt = new Date(student.createdAt);

      // Count new this month
      if (createdAt >= monthStart) {
        counts.new_this_month++;
      }

      // Count by computed status
      if (statusInfo.status === 'scheduled') counts.scheduled++;
      else if (statusInfo.status === 'ready_to_book') counts.ready_to_book++;
      else if (statusInfo.status === 'needs_attention') counts.needs_attention++;
      else if (statusInfo.status === 'completed') counts.completed++;
      else if (statusInfo.status === 'inactive') counts.inactive++;

      if (needsTurning18Alert(student)) counts.turning_18++;
      if (student.needsGuardian) counts.needs_guardian++;
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

      avgProgress += student.progress?.percentComplete ?? 0;
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
      avgProgress,
    };
  }, [data?.data]);

  // Helper to get last lesson date for a student
  const getLastLessonDate = (studentId: string): Date | null => {
    const lessons = lessonsData?.data || [];
    const studentLessons = lessons
      .filter(l => l.studentId === studentId && l.status === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return studentLessons.length > 0 ? new Date(studentLessons[0].date) : null;
  };

  // Display helpers
  const getDisplayName = (student: Student): string => {
    if (student.firstName || student.lastName) {
      return [student.firstName, student.lastName].filter(Boolean).join(' ');
    }
    return student.fullName;
  };

  const getInitials = (student: Student): string => {
    if (student.firstName && student.lastName) {
      return `${student.firstName[0]}${student.lastName[0]}`.toUpperCase();
    }
    return student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const filteredAndSortedStudents = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // First, filter
    const filtered = data?.data?.filter((student) => {
      const statusInfo = getStudentStatus(student);

      // Status filter
      if (statusFilter === 'new_this_month') {
        const createdAt = new Date(student.createdAt);
        if (createdAt < monthStart) return false;
      } else if (statusFilter === 'turning_18') {
        if (!needsTurning18Alert(student)) return false;
      } else if (statusFilter === 'no_show_followup') {
        if (!noShowStudentIds.has(student.id)) return false;
      } else if (statusFilter === 'needs_guardian') {
        if (!student.needsGuardian) return false;
      } else if (statusFilter !== 'all' && statusInfo.status !== statusFilter) {
        return false;
      }

      // Search filter
      return (
        student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
        (student.phone?.includes(searchTerm) ?? false)
      );
    }) || [];

    // Then, sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name': {
          const aSort = a.lastName ? `${a.lastName}${a.firstName}` : a.fullName;
          const bSort = b.lastName ? `${b.lastName}${b.firstName}` : b.fullName;
          return aSort.localeCompare(bSort);
        }
        case 'enrollment_newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'enrollment_oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'last_lesson': {
          const aLastLesson = getLastLessonDate(a.id);
          const bLastLesson = getLastLessonDate(b.id);
          // Students with no lessons go to the end
          if (!aLastLesson && !bLastLesson) return 0;
          if (!aLastLesson) return 1;
          if (!bLastLesson) return -1;
          // Most recent lesson first (for follow-up), or oldest first to prioritize who hasn't been seen
          return aLastLesson.getTime() - bLastLesson.getTime(); // Oldest first
        }
        case 'progress': {
          return (b.progress?.percentComplete ?? 0) - (a.progress?.percentComplete ?? 0); // Closest to completion first
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [data?.data, lessonsData?.data, statusFilter, searchTerm, sortBy, noShowStudentIds]);

  // Keep old variable name for backward compatibility in the JSX
  const filteredStudents = filteredAndSortedStudents;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-2xl font-bold text-tx-primary mt-2">Students</h1>
          <p className="mt-1 text-sm text-tx-muted">
            Manage your driving school students and their guardians
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-edge bg-surface2 p-1">
            <button
              type="button"
              onClick={() => setActiveView('students')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'students' ? 'bg-surface text-tx-primary shadow-sm' : 'text-tx-secondary hover:text-tx-primary'
              }`}
            >
              Students
            </button>
            <button
              type="button"
              onClick={() => setActiveView('guardians')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'guardians' ? 'bg-surface text-tx-primary shadow-sm' : 'text-tx-secondary hover:text-tx-primary'
              }`}
            >
              Guardians
            </button>
          </div>
          <button
            type="button"
            onClick={activeView === 'students' ? handleAddNew : handleAddGuardian}
            className="flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all"
          >
            <Plus className="mr-2 h-5 w-5 flex-shrink-0" />
            {activeView === 'students' ? 'Add Student' : 'Add Guardian'}
          </button>
        </div>
      </div>

      {/* Search - shared between tabs. Typing 2+ characters overlays
          unified cross-type results (students AND guardians) regardless of
          the active tab; clearing it reverts to the current tab's normal
          view. */}
      <div className="flex items-center rounded-xl border border-edge bg-surface px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
        <Search className="h-5 w-5 text-tx-muted flex-shrink-0" />
        <input
          type="text"
          placeholder="Search students and guardians by name, email, or phone..."
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

      {isSearching ? (
        <UnifiedSearchResults
          results={unifiedResults?.data ?? []}
          isLoading={isUnifiedSearchLoading}
          onSelectStudent={handleSelectSearchedStudent}
          onSelectGuardian={handleSelectSearchedGuardian}
        />
      ) : (
      <>

      {activeView === 'students' && (
      <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* New Students This Month */}
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('new_this_month')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-info-bg rounded-lg group-hover:brightness-95 transition-colors">
              <Users className="h-5 w-5 text-primary" />
            </div>
            {/* Comparison Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setComparisonMode(comparisonMode === 'month' ? 'year' : 'month');
              }}
              className={`flex items-center text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                (comparisonMode === 'month' ? stats.diffVsLastMonth : stats.diffVsLastYear) >= 0
                  ? 'text-status-success-text bg-status-success-bg hover:brightness-95'
                  : 'text-status-danger-text bg-status-danger-bg hover:brightness-95'
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
            <p className="text-2xl font-bold text-tx-primary">{stats.newThisMonth}</p>
            <p className="text-sm text-tx-muted">New This Month</p>
            <p className="text-xs text-tx-muted mt-1">
              vs {comparisonMode === 'month' ? 'last month' : 'last year'} ({comparisonMode === 'month' ? stats.newLastMonth : stats.newLastYearSameMonth})
            </p>
          </div>
        </div>

        {/* Scheduled - Students with upcoming lessons */}
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('scheduled')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-success-bg rounded-lg group-hover:brightness-95 transition-colors">
              <Calendar className="h-5 w-5 text-status-success-text" />
            </div>
            {statusCounts.scheduled > 0 && (
              <span className="text-xs font-medium text-status-success-text bg-status-success-bg px-2 py-1 rounded-full">
                On calendar
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{statusCounts.scheduled}</p>
            <p className="text-sm text-tx-muted">Scheduled</p>
          </div>
        </div>

        {/* Ready to Book - Students needing their next lesson */}
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('ready_to_book')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-info-bg rounded-lg group-hover:brightness-95 transition-colors">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            {statusCounts.ready_to_book > 0 && (
              <span className="text-xs font-medium text-primary bg-status-info-bg px-2 py-1 rounded-full">
                Book now
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{statusCounts.ready_to_book}</p>
            <p className="text-sm text-tx-muted">Ready to Book</p>
          </div>
        </div>

        {/* Needs Attention */}
        <div className="bg-surface rounded-xl shadow-sm border border-status-warning-border p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('needs_attention')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-warning-bg rounded-lg group-hover:brightness-95 transition-colors">
              <AlertCircle className="h-5 w-5 text-status-warning-text" />
            </div>
            {statusCounts.needs_attention > 0 && (
              <span className="flex items-center text-xs font-medium text-status-warning-text bg-status-warning-bg px-2 py-1 rounded-full animate-pulse">
                Action needed
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{statusCounts.needs_attention}</p>
            <p className="text-sm text-tx-muted">Need Attention</p>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('completed')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            {stats.completedThisMonth > 0 && (
              <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                +{stats.completedThisMonth} this month
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{statusCounts.completed}</p>
            <p className="text-sm text-tx-muted">Completed</p>
          </div>
        </div>
      </div>

      {/* Status Filter & Sort */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-surface p-4 shadow-sm border border-edge">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <span className="text-sm font-medium text-tx-secondary">Filter:</span>
          {/* View Toggle - Mobile only shows on the right */}
          <div className="flex items-center gap-1 sm:hidden">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-primary/10 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
              title="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-primary/10 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
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
            label="New"
            isActive={statusFilter === 'new_this_month'}
            onClick={() => setStatusFilter('new_this_month')}
            count={statusCounts.new_this_month}
            variant="info"
          />
          <FilterButton
            label="Scheduled"
            isActive={statusFilter === 'scheduled'}
            onClick={() => setStatusFilter('scheduled')}
            count={statusCounts.scheduled}
            variant="success"
          />
          <FilterButton
            label="Ready to Book"
            isActive={statusFilter === 'ready_to_book'}
            onClick={() => setStatusFilter('ready_to_book')}
            count={statusCounts.ready_to_book}
            variant="info"
          />
          <FilterButton
            label="Needs Attention"
            isActive={statusFilter === 'needs_attention'}
            onClick={() => setStatusFilter('needs_attention')}
            count={statusCounts.needs_attention}
            variant="warning"
          />
          {statusCounts.turning_18 > 0 && (
            <FilterButton
              label="Turning 18"
              isActive={statusFilter === 'turning_18'}
              onClick={() => setStatusFilter('turning_18')}
              count={statusCounts.turning_18}
              variant="warning"
            />
          )}
          {statusCounts.needs_guardian > 0 && (
            <FilterButton
              label="Needs Guardian"
              isActive={statusFilter === 'needs_guardian'}
              onClick={() => setStatusFilter('needs_guardian')}
              count={statusCounts.needs_guardian}
              variant="warning"
            />
          )}
          <FilterButton
            label="Completed"
            isActive={statusFilter === 'completed'}
            onClick={() => setStatusFilter('completed')}
            count={statusCounts.completed}
            variant="secondary"
          />
          <FilterButton
            label="Inactive"
            isActive={statusFilter === 'inactive'}
            onClick={() => setStatusFilter('inactive')}
            count={statusCounts.inactive}
            variant="default"
          />
          {/* Sort dropdown */}
          <div className="flex items-center gap-2 ml-auto border-l pl-3">
            <ArrowUpDown className="h-4 w-4 text-tx-muted" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              title="Sort students by"
              aria-label="Sort students by"
              className="text-sm border-none bg-transparent text-tx-secondary focus:ring-0 cursor-pointer pr-6"
            >
              <option value="name">Name A-Z</option>
              <option value="enrollment_newest">Newest First</option>
              <option value="enrollment_oldest">Oldest First</option>
              <option value="last_lesson">Longest Since Lesson</option>
              <option value="progress">Closest to Done</option>
            </select>
          </div>
          {/* Desktop view toggle */}
          <div className="hidden sm:flex items-center gap-1 border-l pl-3">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-primary/10 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
              title="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-primary/10 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
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
                    className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary transition-colors"
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

              return (
                <div
                  key={student.id}
                  className={`bg-surface rounded-xl shadow-sm border p-5 hover:shadow-md transition-all ${
                    statusInfo.status === 'needs_attention' ? 'border-status-warning-border' : 'border-edge hover:brightness-110 hover:border-primary'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {getInitials(student)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-tx-primary truncate">{getDisplayName(student)}</h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <StudentStatusBadge
                            statusInfo={statusInfo}
                            readyToComplete={isReadyToMarkComplete(student)}
                            title={statusInfo.status === 'needs_attention'
                              ? getFollowupReason(student, lessonsData?.data || [], statusNow, student.activeEnrollment ?? null)
                              : statusInfo.reason}
                          />
                          {student.needsGuardian && (
                            <span
                              className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none bg-status-warning-bg text-status-warning-text"
                              title="This minor has no linked guardian record"
                            >
                              Needs Guardian
                            </span>
                          )}
                          {student.hasOutstandingFee && (
                            <span
                              className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none bg-status-warning-bg text-status-warning-text"
                              title={`Outstanding fee: $${(student.outstandingFeeAmount ?? 0).toFixed(2)}`}
                            >
                              Outstanding Fee
                            </span>
                          )}
                        </div>
                        {/* Status reason - visible on cards */}
                        {statusInfo.reason && (
                          <p className="text-xs text-tx-muted mt-1 truncate">
                            {statusInfo.status === 'needs_attention'
                              ? getFollowupReason(student, lessonsData?.data || [], statusNow, student.activeEnrollment ?? null)
                              : statusInfo.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <StudentProgressBar progress={student.progress} />
                  </div>

                  {/* Contact Info - falls back to the linked guardian's
                      contact for a minor with none of their own. */}
                  {(() => {
                    const contact = getStudentContactDisplay(student);
                    return (
                      <div className="space-y-2 mb-4 text-sm">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-tx-secondary hover:text-primary truncate">
                            <Mail className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{contact.email}{contact.isGuardianFallback && <span className="text-tx-muted"> (Guardian)</span>}</span>
                          </a>
                        )}
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-tx-secondary hover:text-primary">
                            <Phone className="h-4 w-4 flex-shrink-0" />
                            {contact.phone}{contact.isGuardianFallback && !contact.email && <span className="text-tx-muted"> (Guardian)</span>}
                          </a>
                        )}
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-edge">
                    <button
                      type="button"
                      onClick={() => handleBookLesson(student, null)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 hover:bg-primary transition-colors"
                    >
                      <Calendar className="h-4 w-4" />
                      Book
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(student)}
                      className="p-2 text-tx-secondary hover:text-primary hover:bg-status-info-bg rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    {statusInfo.status === 'needs_attention' && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsContacted(student.id)}
                        className="p-2 text-status-warning-text hover:text-amber-700 hover:bg-status-warning-bg rounded-lg transition-colors"
                        title="Mark as contacted"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
                    {isReadyToMarkComplete(student) && (
                      <button
                        type="button"
                        onClick={() => setCompletingStudentId(student.id)}
                        className={`p-2 rounded-lg ${MARK_COMPLETE_BUTTON_CLASSES}`}
                        title="Mark complete"
                      >
                        <GraduationCap className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Guided mark-complete confirm - only reachable once the
                      active enrollment has actually met its requirement
                      (isReadyToMarkComplete above). Same shape as
                      StudentModal's own enrollment-tab flow: a non-empty
                      reason is required before the confirm button enables -
                      completion is an audit-recorded compliance event (it
                      drives the certificate worklist), never a casual toggle. */}
                  {completingStudentId === student.id && (
                    <div className="mt-3 bg-status-success-bg border border-status-success-border rounded-lg p-3 space-y-2">
                      <label className="block text-xs font-medium text-status-success-text">
                        Completion reason
                      </label>
                      <input
                        type="text"
                        value={completionReason}
                        onChange={(e) => setCompletionReason(e.target.value)}
                        className="w-full px-3 py-2 border border-status-success-border rounded-lg text-sm bg-surface"
                        placeholder="e.g. Finished all required hours"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCompletingStudentId(null);
                            setCompletionReason('');
                          }}
                          className="px-3 py-1.5 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            student.activeEnrollment &&
                            completeEnrollmentMutation.mutate({ enrollmentId: student.activeEnrollment.id, reason: completionReason })
                          }
                          disabled={!completionReason.trim() || completeEnrollmentMutation.isPending}
                          className="px-3 py-1.5 text-sm font-medium bg-status-success-text text-white rounded-lg hover:brightness-90 transition-colors disabled:opacity-50"
                        >
                          {completeEnrollmentMutation.isPending ? 'Saving...' : 'Confirm complete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl bg-surface shadow-sm border border-edge">
          <table className="min-w-full divide-y divide-white/20">
            <thead className="bg-surface/8">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary hidden md:table-cell">
                  Contact
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  Progress
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary hidden lg:table-cell">
                  History
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-tx-secondary min-w-[120px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20 bg-transparent">
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
                          className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary transition-colors"
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

                  return (
                    <React.Fragment key={student.id}>
                    <tr className={`group hover:bg-surface2 cursor-pointer ${statusInfo.status === 'needs_attention' ? 'bg-status-warning-bg' : ''}`} onClick={() => handleEdit(student)}>
                      {/* Student Name with Avatar */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                            {getInitials(student)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="font-medium text-tx-primary truncate">{getDisplayName(student)}</div>
                              {student.needsGuardian && (
                                <span
                                  className="inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold bg-status-warning-bg text-status-warning-text"
                                  title="This minor has no linked guardian record"
                                >
                                  Needs Guardian
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-tx-muted md:hidden truncate">
                              {(() => {
                                const contact = getStudentContactDisplay(student);
                                const value = contact.email || contact.phone;
                                return value ? `${value}${contact.isGuardianFallback ? ' (Guardian)' : ''}` : '—';
                              })()}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Contact - Hidden on mobile. Falls back to the
                          linked guardian's contact for a minor with none of
                          their own (getStudentContactDisplay - shared with
                          the card view and the detail modal so they can't
                          diverge). */}
                      <td className="px-6 py-4 hidden md:table-cell">
                        {(() => {
                          const contact = getStudentContactDisplay(student);
                          return (
                            <>
                              <div className="text-sm text-tx-primary">
                                {contact.email
                                  ? <>{contact.email}{contact.isGuardianFallback && <span className="text-tx-muted"> (Guardian)</span>}</>
                                  : <span className="text-tx-muted italic">No email (minor)</span>}
                              </div>
                              <div className="text-sm text-tx-muted">
                                {contact.phone
                                  ? <>{contact.phone}{contact.isGuardianFallback && !contact.email && <span> (Guardian)</span>}</>
                                  : null}
                              </div>
                            </>
                          );
                        })()}
                      </td>
                      {/* Status - hover for reason */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StudentStatusBadge
                            statusInfo={statusInfo}
                            readyToComplete={isReadyToMarkComplete(student)}
                            title={statusInfo.status === 'needs_attention'
                              ? getFollowupReason(student, lessonsData?.data || [], statusNow, student.activeEnrollment ?? null)
                              : statusInfo.reason}
                          />
                          {student.hasOutstandingFee && (
                            <span
                              className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none bg-status-warning-bg text-status-warning-text"
                              title={`Outstanding fee: $${(student.outstandingFeeAmount ?? 0).toFixed(2)}`}
                            >
                              Outstanding Fee
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Progress with visual bar */}
                      <td className="px-6 py-4">
                        <div className="w-32">
                          <StudentProgressBar progress={student.progress} />
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
                      {/* Actions - per-row hover reveal (Gmail/Linear/Notion
                          pattern), not sticky/pinned. Hidden by default and
                          faded in via opacity (never a layout insert, so
                          nothing shifts) when the cursor is ANYWHERE on this
                          row (group-hover on the <tr> above) or when any
                          action inside receives keyboard focus
                          (group-focus-within - :focus-within fires from a
                          focused descendant, so Tab-ing to a button reveals
                          the row the same way hover does). The whole reveal
                          is gated behind the (hover: hover) media feature -
                          on a touch/coarse-pointer device, which has no
                          hover to trigger it, actions stay always visible
                          (the base opacity-100, unconditionally). */}
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                          {statusInfo.status === 'needs_attention' && (
                            <button
                              type="button"
                              onClick={() => handleMarkAsContacted(student.id)}
                              className="p-2 text-status-warning-text hover:brightness-75 hover:bg-status-warning-bg rounded-lg transition-all hover:scale-110"
                              title="Mark as contacted"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBookLesson(student, null);
                            }}
                            className="p-2 text-status-success-text hover:brightness-75 hover:bg-status-success-bg rounded-lg transition-all hover:scale-110"
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
                            className="p-2 text-primary hover:brightness-75 hover:bg-status-info-bg rounded-lg transition-all hover:scale-110"
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
                            className="p-2 text-status-danger-text hover:brightness-75 hover:bg-status-danger-bg rounded-lg transition-all hover:scale-110"
                            title="Delete student"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {isReadyToMarkComplete(student) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCompletingStudentId(student.id);
                              }}
                              className={`p-2 rounded-lg ${MARK_COMPLETE_BUTTON_CLASSES}`}
                              title="Mark complete"
                            >
                              <GraduationCap className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Guided mark-complete confirm - same shape as the card
                        view's inline form and StudentModal's own
                        enrollment-tab flow: a non-empty reason is required
                        before the confirm button enables. */}
                    {completingStudentId === student.id && (
                      <tr>
                        <td colSpan={6} className="px-6 py-3 bg-status-success-bg border-t border-status-success-border">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <label className="text-xs font-medium text-status-success-text flex-shrink-0">
                              Completion reason
                            </label>
                            <input
                              type="text"
                              value={completionReason}
                              onChange={(e) => setCompletionReason(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-status-success-border rounded-lg text-sm bg-surface"
                              placeholder="e.g. Finished all required hours"
                            />
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setCompletingStudentId(null);
                                  setCompletionReason('');
                                }}
                                className="px-3 py-1.5 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  student.activeEnrollment &&
                                  completeEnrollmentMutation.mutate({ enrollmentId: student.activeEnrollment.id, reason: completionReason })
                                }
                                disabled={!completionReason.trim() || completeEnrollmentMutation.isPending}
                                className="px-3 py-1.5 text-sm font-medium bg-status-success-text text-white rounded-lg hover:brightness-90 transition-colors disabled:opacity-50"
                              >
                                {completeEnrollmentMutation.isPending ? 'Saving...' : 'Confirm complete'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
        <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 shadow-sm border border-edge">
          <div className="text-sm text-tx-secondary">
            <span className="font-medium">{filteredStudents?.length || 0}</span> of{' '}
            <span className="font-medium">{data.pagination.total}</span> students
            {statusFilter !== 'all' && (
              <span className="text-tx-muted ml-1">
                (filtered)
              </span>
            )}
            <span className="text-tx-muted mx-2">•</span>
            Page {data.pagination.page} of {data.pagination.totalPages}
          </div>
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
      )}
      </>
      )}

      {/* Guardians view */}
      {activeView === 'guardians' && (
        <GuardiansList onSelect={handleGuardianSelect} />
      )}
      </>
      )}

      {/* Student Modal */}
      {isModalOpen && (
        <StudentModal
          student={selectedStudent}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedStudent(null);
            setGuardianPrefill(undefined);
          }}
          onBookLesson={handleBookLesson}
          prefillFromGuardian={selectedStudent ? undefined : guardianPrefill}
          onViewGuardian={handleSelectSearchedGuardian}
        />
      )}

      {/* SmartBookingForm - for booking lessons */}
      {isSmartBookingOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <SmartBookingForm
              preselectedStudent={studentForBooking || undefined}
              prefilledInstructorId={bookAgainPrefill?.instructorId}
              prefilledDuration={bookAgainPrefill?.duration}
              prefilledLessonType={bookAgainPrefill?.lessonType}
              prefilledTimePreference={bookAgainPrefill?.timePreference}
              prefilledPickupAddress={bookAgainPrefill?.pickupAddress}
              onBookingComplete={handleBookingComplete}
              onCancel={() => {
                setIsSmartBookingOpen(false);
                setStudentForBooking(null);
                setBookAgainPrefill(undefined);
              }}
            />
          </div>
        </div>
      )}

      {/* Guardian Modal */}
      {isGuardianModalOpen && (
        <GuardianModal
          guardian={selectedGuardian}
          onClose={() => {
            setIsGuardianModalOpen(false);
            setSelectedGuardian(null);
          }}
          onEnrollAnother={handleEnrollAnother}
        />
      )}
    </div>
  );
};
