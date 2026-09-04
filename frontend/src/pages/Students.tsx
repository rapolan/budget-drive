import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Calendar, CheckCircle, Users, LayoutGrid, LayoutList, Phone, Mail, UserCheck, AlertCircle, TrendingUp, GraduationCap, ChevronDown, X, ArrowUpDown, DollarSign } from 'lucide-react';
import { studentsApi, lessonsApi, dashboardApi, searchApi, guardiansApi, enrollmentsApi, feeFlagsApi } from '@/api';
import type { Student, Guardian, LinkedStudent, Lesson } from '@/types';
import { StudentModal } from '@/components/students/StudentModal';
import { StudentProgressBar } from '@/components/students/StudentProgressBar';
import { StudentStatusBadge } from '@/components/students/StudentStatusBadge';
import type { GuardianPrefill } from '@/components/students/StudentModal';
import { SmartBookingForm } from '@/components/scheduling/SmartBookingForm';
import { GuardiansList } from '@/components/guardians/GuardiansList';
import { GuardianModal } from '@/components/guardians/GuardianModal';
import { UnifiedSearchResults } from '@/components/guardians/UnifiedSearchResults';
import { computeStudentStatus, getFollowupReason, computeDeStatus, getDisplayStatus, type ProgramFilter } from '@/utils/studentStatus';
import { getStudentContactDisplay } from '@/utils/studentContact';
import { isReadyToMarkComplete, MARK_COMPLETE_BUTTON_CLASSES } from '@/utils/studentActionEligibility';
import { bucketTimePreference } from '@/utils/timePreferenceBucket';
import { needsTurning18Alert } from '@/utils/turning18';
import { EmptyState, LoadingSpinner, FilterButton, BackButton, ModalShell } from '@/components/common';
import { AuditColumn } from '@/components/common/AuditColumn';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useDebounce } from '@/hooks/useDebounce';
import { useSessionState } from '@/hooks/useSessionState';
import { useTenant } from '@/contexts/TenantContext';
import { parseLocalDate } from '@/utils/timeFormat';

// The visible filter bar is exactly 6 chips: all/scheduled/ready_to_book/
// needs_attention/completed/inactive (item 1). turning_18 stays a valid
// value with no chip - reachable only via Dashboard's "Turning 18" deep-
// link (see the location.state effect above) - needsTurning18Alert and its
// StudentModal track-decision workflow are unrelated to this cleanup and
// stay exactly as they are. no_show_followup/needs_guardian are gone
// entirely as filter values (folded into needs_attention, item 2).
type StatusFilter = 'all' | 'scheduled' | 'ready_to_book' | 'needs_attention' | 'completed' | 'inactive' | 'turning_18';
type ViewMode = 'table' | 'cards';
type SortOption = 'name' | 'enrollment_newest' | 'enrollment_oldest' | 'last_lesson' | 'progress';
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
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all');
  const [viewMode, setViewMode] = useSessionState<ViewMode>('students-view-mode', 'table', isViewMode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Which tab StudentModal opens on - 'progress' for the list's "Waive"
  // action (routes to the existing waive-with-reason flow there rather
  // than duplicating it), 'details' for every other entry point.
  const [modalInitialTab, setModalInitialTab] = useState<'details' | 'progress'>('details');
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

  // Check for filter from navigation state. no_show_followup and
  // needs_guardian no longer have their own filter/chip (item 2 folds both
  // into the Needs Attention overlay) - a deep-link to either now lands on
  // needs_attention instead, where the student still shows up via their
  // own row flag. turning_18 has no visible chip but keeps its own filter
  // value (see statusCounts.turning_18) so Dashboard's "Turning 18" alert
  // still lands on a correctly-filtered list.
  useEffect(() => {
    if (location.state?.filter === 'needs_attention' || location.state?.filter === 'turning_18') {
      setStatusFilter(location.state.filter);
      setTimeout(scrollToTable, 100);
    } else if (location.state?.filter === 'no_show_followup' || location.state?.filter === 'needs_guardian') {
      setStatusFilter('needs_attention');
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
  // purely derivable from already-fetched student/lesson data. Fetched
  // unconditionally (not gated to one filter) since it now also feeds
  // Needs Attention's composite check and every row's flag list, not just
  // the no_show_followup deep-link filter.
  const { data: noShowAlertsData } = useQuery({
    queryKey: ['dashboard', 'no-show-alerts'],
    queryFn: () => dashboardApi.getNoShowAlerts(),
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
  // flow: reveals a simple confirm step (no reason field - item 1) before
  // the mutation fires - completion is an audit-recorded compliance event
  // (it drives the certificate worklist), never a casual toggle, so it
  // deliberately does not fire on the first click alone.
  const [completingStudentId, setCompletingStudentId] = useState<string | null>(null);

  // No reason on the complete path (item 1) - enrollmentsApi.complete's
  // reason parameter is optional; only reopen/withdraw require one.
  const completeEnrollmentMutation = useMutation({
    mutationFn: ({ enrollmentId }: { enrollmentId: string }) => enrollmentsApi.complete(enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setCompletingStudentId(null);
    },
  });

  // One-click "Paid" for ALL of a student's outstanding fees at once
  // (payee-aware server-side - see feeFlagService.markStudentFeesPaid).
  // "Waive" requires a typed reason (discretionary, audit-relevant) and is
  // NOT rebuilt here as a second inline form - it routes to the existing
  // waive-with-reason flow in StudentModal's Progress tab instead, so
  // there's exactly one implementation of that flow, not two.
  const markFeesPaidMutation = useMutation({
    mutationFn: (studentId: string) => feeFlagsApi.markStudentFeesPaid(studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });

  const handleMarkFeesPaid = (student: Student) => {
    const amount = (student.outstandingFeeAmount ?? 0).toFixed(2);
    if (window.confirm(`Mark $${amount} in outstanding fees as paid for ${getDisplayName(student)}?`)) {
      markFeesPaidMutation.mutate(student.id);
    }
  };

  // Waiving requires a typed reason - routes to the existing form in
  // StudentModal's Progress tab rather than duplicating it inline here.
  const handleWaiveFees = (student: Student) => {
    setSelectedStudent(student);
    setModalInitialTab('progress');
    setIsModalOpen(true);
  };

  const handleEdit = (student: Student) => {
    setSelectedStudent(student);
    setModalInitialTab('details');
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

  // DE's parallel status track (item 1 of the program-aware Students page -
  // see docs/ARCHITECTURE.md) - a student's driver_education enrollment
  // status, computed from the SAME batch-attached deEnrollment field the
  // Program column and filter below also read.
  const getStudentDeStatus = (student: Student) => computeDeStatus(student.deEnrollment);

  // Single dispatcher: which status track a row shows depends on the
  // active program filter, not just the student's own enrollments -
  // 'all' resolves to the furthest-along program (BTW if present, else DE).
  const getStudentDisplayStatus = (student: Student) =>
    getDisplayStatus(student, programFilter, getStudentStatus(student), getStudentDeStatus(student));

  // Program filter predicates (item 3) - read only fields already
  // batch-attached to Student (activeEnrollment, deEnrollment), zero extra
  // queries. A student satisfying both still yields exactly one row from
  // .filter() below - never duplicated, by construction (one student
  // object, one boolean check).
  const hasBtw = (student: Student): boolean => student.activeEnrollment !== null && student.activeEnrollment !== undefined;
  const hasDe = (student: Student): boolean => !!student.deEnrollment;

  // Composite "needs attention" reasons for the Students page's OWN
  // filtering/counting/row-flags (item 2). Deliberately NOT folded into
  // computeStudentStatus itself, which stays a pure function shared with
  // Dashboard.tsx - Dashboard already renders needsGuardian/hasOutstandingFee/
  // no-show as their own separate alert cards, and widening the shared
  // status computation would silently duplicate those into its
  // "Needs Attention" count too. Each reason gets a short, admin-facing
  // label (+ a longer tooltip) for the per-row amber flag; a student can
  // carry more than one - all applicable flags render, not just the first.
  interface AttentionReason {
    label: string;
    title: string;
  }

  const getNeedsAttentionReasons = (student: Student): AttentionReason[] => {
    const reasons: AttentionReason[] = [];
    const statusInfo = getStudentStatus(student);
    if (statusInfo.status === 'needs_attention') {
      reasons.push({
        label: 'Follow up',
        title: getFollowupReason(student, lessonsData?.data || [], statusNow, student.activeEnrollment ?? null),
      });
    }
    if (student.needsGuardian) {
      reasons.push({ label: 'Needs guardian', title: 'This minor has no linked guardian record' });
    }
    if (student.hasOutstandingFee) {
      reasons.push({ label: 'Fee due', title: `Outstanding fee: $${(student.outstandingFeeAmount ?? 0).toFixed(2)}` });
    }
    if (noShowStudentIds.has(student.id)) {
      reasons.push({ label: 'No-show follow-up', title: 'Missed a lesson - follow-up not yet dismissed' });
    }
    return reasons;
  };

  const studentNeedsAnyAttention = (student: Student): boolean =>
    getNeedsAttentionReasons(student).length > 0;

  // Program column (item 4) - "DE", "BTW", or "DE·BTW". Reads only the
  // already-attached activeEnrollment/deEnrollment fields.
  const getProgramBadgeLabel = (student: Student): string => {
    const de = hasDe(student);
    const btw = hasBtw(student);
    if (de && btw) return 'DE·BTW';
    if (btw) return 'BTW';
    if (de) return 'DE';
    return '—';
  };

  // Shared amber flag pill (item 2) - same tokens/shape as the existing
  // Needs Guardian/Outstanding Fee badges already used elsewhere in this
  // file, just centralized so all four reasons render identically in both
  // the card and table views.
  const renderAttentionFlags = (student: Student) =>
    getNeedsAttentionReasons(student).map((reason) => (
      <span
        key={reason.label}
        className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none bg-status-warning-bg text-status-warning-text"
        title={reason.title}
      >
        {reason.label}
      </span>
    ));

  // Calculate status counts for filter buttons. Base status (scheduled/
  // ready_to_book/completed/inactive) is a mutually-exclusive partition -
  // every student is in exactly one, unaffected by attention reasons.
  // needs_attention is a separate OVERLAY count (item 2): it cross-cuts
  // base status, so it does NOT subtract from the others and the six
  // numbers are not expected to sum to `all` - a scheduled student with a
  // fee due is genuinely both scheduled AND needing attention. turning_18
  // keeps its own count (no visible chip - see below) purely so
  // Dashboard's "Turning 18" alert deep-link still lands on a correctly
  // filtered list.
  const statusCounts = React.useMemo(() => {
    const counts = {
      all: data?.data?.length || 0,
      scheduled: 0,
      ready_to_book: 0,
      needs_attention: 0,
      completed: 0,
      inactive: 0,
      turning_18: 0,
    };

    counts.all = data?.data?.length || 0;

    data?.data?.forEach((student) => {
      const statusInfo = getStudentStatus(student);

      // Count by base computed status - a pure partition, untouched by
      // guardian/fee/no-show reasons.
      if (statusInfo.status === 'scheduled') counts.scheduled++;
      else if (statusInfo.status === 'ready_to_book') counts.ready_to_book++;
      else if (statusInfo.status === 'needs_attention') counts.needs_attention++;
      else if (statusInfo.status === 'completed') counts.completed++;
      else if (statusInfo.status === 'inactive') counts.inactive++;

      if (needsTurning18Alert(student)) counts.turning_18++;
    });

    // needs_attention is then widened from "base status is needs_attention"
    // to "has any attention reason" - overwritten here rather than
    // accumulated in the loop above so the two concepts (base-status
    // needs_attention vs the full overlay) stay clearly separate steps.
    counts.needs_attention = (data?.data || []).filter(studentNeedsAnyAttention).length;

    return counts;
  }, [data?.data, lessonsData?.data, noShowStudentIds]);

  // Program filter counts (item 3/4) - read only the already-attached
  // activeEnrollment/deEnrollment fields, no extra queries.
  const programCounts = React.useMemo(() => {
    const students = data?.data || [];
    return {
      all: students.length,
      btw: students.filter(hasBtw).length,
      de: students.filter(hasDe).length,
    };
  }, [data?.data]);

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
    // First, filter
    const filtered = data?.data?.filter((student) => {
      // Program filter (item 3) - "All" = every student, one row each; a
      // dual-program student passes both hasBtw and hasDe checks but is
      // still filtered by ONE boolean per student, never duplicated.
      if (programFilter === 'btw' && !hasBtw(student)) return false;
      if (programFilter === 'de' && !hasDe(student)) return false;

      const statusInfo = getStudentStatus(student);

      // Status filter. needs_attention is the overlay (item 2) - "has any
      // attention reason", cross-cutting base status - never the plain
      // base-status equality check the other chips use. turning_18 has no
      // chip but stays reachable via Dashboard's deep-link. These BTW-status
      // chips only apply meaningfully when the displayed row is showing BTW
      // status - a DE-filtered view has its own (currently unfiltered by
      // sub-status) list, so the status chips are left as-is here and simply
      // have no effect when programFilter === 'de' (item 3's scope is the
      // program filter alone, not a redesign of the status chips).
      if (programFilter !== 'de') {
        if (statusFilter === 'needs_attention') {
          if (!studentNeedsAnyAttention(student)) return false;
        } else if (statusFilter === 'turning_18') {
          if (!needsTurning18Alert(student)) return false;
        } else if (statusFilter !== 'all' && statusInfo.status !== statusFilter) {
          return false;
        }
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
  }, [data?.data, lessonsData?.data, statusFilter, programFilter, searchTerm, sortBy, noShowStudentIds]);

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
        {/* New Students This Month - informational only (item 3), not a
            filter. Its actual tasks already live in Ready to Book (no
            lessons yet) and Needs Attention (needs guardian), so there's
            nothing distinct here to filter down to. */}
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-info-bg rounded-lg transition-colors">
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

        {/* Scheduled - Students with upcoming lessons. Green/success (item 5
            swap - was blue/info): "on track, all set", matching the status
            column's "scheduled" treatment (StudentStatusBadge /
            computeStudentStatus). */}
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

        {/* Ready to Book - Students needing their next lesson. Blue/info
            (item 5 swap - was green/success): "neutral, between lessons",
            matching the status column's "ready_to_book" treatment (the calm
            between-lessons state). */}
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

        {/* Completed - gray/neutral, matching the status column's
            "completed" treatment (finished, not urgent - surface3/
            tx-secondary, not a color-coded status). */}
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4 hover:shadow-md transition-shadow cursor-pointer group"
             onClick={() => handleStatCardClick('completed')}>
          <div className="flex items-center justify-between">
            <div className="p-2 bg-surface3 rounded-lg group-hover:brightness-95 transition-colors">
              <GraduationCap className="h-5 w-5 text-tx-secondary" />
            </div>
            {stats.completedThisMonth > 0 && (
              <span className="text-xs font-medium text-tx-secondary bg-surface3 px-2 py-1 rounded-full">
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
        {/* Program filter (All / Behind-the-Wheel / Driver Education) -
            matches the existing status-filter chip pattern, placed above
            it. "All" = every student; BTW/DE each show only students with
            that program's enrollment, one row per student regardless of
            how many programs they're enrolled in. */}
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:mr-2">
          <FilterButton
            label="Every Program"
            isActive={programFilter === 'all'}
            onClick={() => setProgramFilter('all')}
            count={programCounts.all}
            variant="default"
          />
          <FilterButton
            label="Behind-the-Wheel"
            isActive={programFilter === 'btw'}
            onClick={() => setProgramFilter('btw')}
            count={programCounts.btw}
            variant="default"
          />
          <FilterButton
            label="Driver Education"
            isActive={programFilter === 'de'}
            onClick={() => setProgramFilter('de')}
            count={programCounts.de}
            variant="default"
          />
        </div>
        {/* Exactly 6 working-state chips (item 1) - new_this_month is now
            stat-card-only (item 3); turning_18/no_show_followup/
            needs_guardian are gone as chips, folded into Needs Attention
            (item 2) or, for turning_18, kept reachable only via Dashboard's
            deep-link (no chip - see the StatusFilter/location.state notes
            above). Color swap (item 5): Scheduled is now
            success/green ("on track, all set"), Ready to Book is now
            info/blue ("neutral, between lessons") - was the reverse. */}
        <div className="flex flex-wrap gap-2 flex-1">
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
          <FilterButton
            label="Completed"
            isActive={statusFilter === 'completed'}
            onClick={() => setStatusFilter('completed')}
            count={statusCounts.completed}
            variant="default"
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
              const displayStatus = getStudentDisplayStatus(student);
              const displayReason = displayStatus.kind === 'de'
                ? displayStatus.info.reason
                : displayStatus.info.status === 'needs_attention'
                ? getFollowupReason(student, lessonsData?.data || [], statusNow, student.activeEnrollment ?? null)
                : displayStatus.info.reason;

              return (
                <div
                  key={student.id}
                  className={`bg-surface rounded-xl shadow-sm border p-5 hover:shadow-md transition-all ${
                    studentNeedsAnyAttention(student) ? 'border-status-warning-border' : 'border-edge hover:brightness-110 hover:border-primary'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {getInitials(student)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-semibold text-tx-primary truncate">{getDisplayName(student)}</h3>
                          <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none bg-surface3 text-tx-secondary" title="Program(s) enrolled">
                            {getProgramBadgeLabel(student)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <StudentStatusBadge
                            statusInfo={displayStatus}
                            readyToComplete={displayStatus.kind === 'btw' && isReadyToMarkComplete(student, lessonsData?.data || [])}
                            title={displayReason}
                          />
                          {renderAttentionFlags(student)}
                        </div>
                        {/* Status reason - visible on cards */}
                        {displayReason && (
                          <p className="text-xs text-tx-muted mt-1 truncate">
                            {displayReason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <StudentProgressBar
                      progress={student.progress}
                      deStatus={displayStatus.kind === 'de' ? displayStatus.info : undefined}
                    />
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
                    {isReadyToMarkComplete(student, lessonsData?.data || []) && (
                      <button
                        type="button"
                        onClick={() => setCompletingStudentId(student.id)}
                        className={`p-2 rounded-lg ${MARK_COMPLETE_BUTTON_CLASSES}`}
                        title="Mark complete"
                      >
                        <GraduationCap className="h-4 w-4" />
                      </button>
                    )}
                    {student.hasOutstandingFee && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleMarkFeesPaid(student)}
                          aria-label="Mark outstanding fees paid"
                          title="Mark fees paid"
                          className="p-2 text-primary hover:brightness-75 hover:bg-status-info-bg rounded-lg transition-colors"
                        >
                          <DollarSign className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWaiveFees(student)}
                          aria-label="Waive outstanding fees"
                          title="Waive fees"
                          className="p-2 text-status-warning-text hover:brightness-75 hover:bg-status-warning-bg rounded-lg transition-colors"
                        >
                          <AlertCircle className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Guided mark-complete confirm - only reachable once the
                      active enrollment has actually met its requirement
                      (isReadyToMarkComplete above). No reason field on this
                      path (item 1) - just a confirm step, to guard against
                      a misclick given completion triggers certificates and
                      is itself audit-recorded. */}
                  {completingStudentId === student.id && (
                    <div className="mt-3 bg-status-success-bg border border-status-success-border rounded-lg p-3 space-y-2">
                      <p className="text-sm text-status-success-text">
                        Mark {student.fullName} complete?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setCompletingStudentId(null)}
                          className="px-3 py-1.5 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            student.activeEnrollment &&
                            completeEnrollmentMutation.mutate({ enrollmentId: student.activeEnrollment.id })
                          }
                          disabled={completeEnrollmentMutation.isPending}
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
      <div className="rounded-xl bg-surface shadow-sm border border-edge overflow-hidden">
        <div className="overflow-x-auto">
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
                  Program
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  Progress
                </th>
                <th className="pl-6 pr-2 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary hidden lg:table-cell">
                  History
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
                  const displayStatus = getStudentDisplayStatus(student);
                  const displayReason = displayStatus.kind === 'de'
                    ? displayStatus.info.reason
                    : displayStatus.info.status === 'needs_attention'
                    ? getFollowupReason(student, lessonsData?.data || [], statusNow, student.activeEnrollment ?? null)
                    : displayStatus.info.reason;

                  return (
                    <React.Fragment key={student.id}>
                    <tr className={`group hover:bg-surface2 cursor-pointer ${studentNeedsAnyAttention(student) ? 'bg-status-warning-bg' : ''}`} onClick={() => handleEdit(student)}>
                      {/* Student Name with Avatar */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                            {getInitials(student)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="font-medium text-tx-primary truncate">{getDisplayName(student)}</div>
                            </div>
                            <div className="text-sm text-tx-muted md:hidden truncate">
                              {(() => {
                                const contact = getStudentContactDisplay(student);
                                const value = contact.email || contact.phone;
                                return value ? `${value}${contact.isGuardianFallback ? ' (Guardian)' : ''}` : '—';
                              })()}
                            </div>
                            {/* Row actions - under the name, not a
                                right-side column (item 1's fix: actions on
                                the far right required scrolling right to
                                reach regardless of how they appeared; the
                                name is always on-screen, so actions belong
                                there). This line's height is reserved
                                unconditionally (min-h-[28px], not
                                conditionally rendered) so a hovered row
                                never reflows the ones around it - only the
                                icons themselves fade in/out via opacity.
                                Same (hover: hover)-gated reveal as before:
                                hidden until the cursor is ANYWHERE on the
                                row or an action inside receives keyboard
                                focus, always visible on touch/coarse-
                                pointer devices (no hover to trigger it
                                there - instructors will use a touch
                                build). Delete is visually separated (a
                                left border + margin) from the routine
                                actions since it's the one destructive one
                                in the set. */}
                            <div className="min-h-[28px] flex items-center gap-1 mt-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                              {isReadyToMarkComplete(student, lessonsData?.data || []) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCompletingStudentId(student.id);
                                  }}
                                  aria-label="Mark program complete"
                                  title="Mark complete"
                                  className={`p-1.5 rounded-lg ${MARK_COMPLETE_BUTTON_CLASSES}`}
                                >
                                  <GraduationCap className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBookLesson(student, null);
                                }}
                                aria-label="Book a lesson"
                                title="Book lesson"
                                className="p-1.5 text-status-success-text hover:brightness-75 hover:bg-status-success-bg rounded-lg transition-all hover:scale-110"
                              >
                                <Calendar className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(student);
                                }}
                                aria-label="Edit student"
                                title="Edit student"
                                className="p-1.5 text-primary hover:brightness-75 hover:bg-status-info-bg rounded-lg transition-all hover:scale-110"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              {student.hasOutstandingFee && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMarkFeesPaid(student);
                                    }}
                                    aria-label="Mark outstanding fees paid"
                                    title="Mark fees paid"
                                    className="p-1.5 text-primary hover:brightness-75 hover:bg-status-info-bg rounded-lg transition-all hover:scale-110"
                                  >
                                    <DollarSign className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleWaiveFees(student);
                                    }}
                                    aria-label="Waive outstanding fees"
                                    title="Waive fees"
                                    className="p-1.5 text-status-warning-text hover:brightness-75 hover:bg-status-warning-bg rounded-lg transition-all hover:scale-110"
                                  >
                                    <AlertCircle className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                              {statusInfo.status === 'needs_attention' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkAsContacted(student.id);
                                  }}
                                  aria-label="Mark as contacted"
                                  title="Mark as contacted"
                                  className="p-1.5 text-status-warning-text hover:brightness-75 hover:bg-status-warning-bg rounded-lg transition-all hover:scale-110"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </button>
                              )}
                              {/* Delete - visually separated (border +
                                  margin) since it's the one destructive
                                  action here; window.confirm inside
                                  handleDelete is its confirmation. */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(student.id);
                                }}
                                aria-label="Delete student"
                                title="Delete student"
                                className="ml-1 pl-2 border-l border-edge p-1.5 text-tx-muted hover:text-status-danger-text hover:bg-status-danger-bg rounded-lg transition-all"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
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
                      {/* Program - "DE", "BTW", or "DE·BTW" (item 4) */}
                      <td className="px-6 py-4">
                        <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none bg-surface3 text-tx-secondary" title="Program(s) enrolled">
                          {getProgramBadgeLabel(student)}
                        </span>
                      </td>
                      {/* Status - hover for reason */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StudentStatusBadge
                            statusInfo={displayStatus}
                            readyToComplete={displayStatus.kind === 'btw' && isReadyToMarkComplete(student, lessonsData?.data || [])}
                            title={displayReason}
                          />
                          {renderAttentionFlags(student)}
                        </div>
                      </td>
                      {/* Progress with visual bar */}
                      <td className="px-6 py-4">
                        <div className="w-32">
                          <StudentProgressBar
                            progress={student.progress}
                            deStatus={displayStatus.kind === 'de' ? displayStatus.info : undefined}
                          />
                        </div>
                      </td>
                      {/* History - Hidden on mobile */}
                      <td className="pl-6 pr-2 py-4 whitespace-nowrap hidden lg:table-cell">
                        <AuditColumn
                          createdByName={student.createdByName}
                          updatedByName={student.updatedByName}
                          createdAt={student.createdAt}
                          updatedAt={student.updatedAt}
                        />
                      </td>
                    </tr>
                    {/* Guided mark-complete confirm - same shape as the card
                        view's inline form and StudentModal's own
                        enrollment-tab flow. No reason field on this path
                        (item 1, see the card view's identical note above) -
                        just a confirm step. Rendered under the Name column
                        specifically (not spread with justify-between across
                        the full colSpan row) so it appears right where the
                        user clicked the row action, instead of pushing
                        Cancel/Confirm out to the far-right edge of a wide
                        table - the same travel-distance problem the row
                        actions themselves moved under the name to fix. */}
                    {completingStudentId === student.id && (
                      <tr>
                        <td colSpan={6} className="px-6 py-3 bg-status-success-bg border-t border-status-success-border">
                          <div className="max-w-sm space-y-2" onClick={(e) => e.stopPropagation()}>
                            <p className="text-sm text-status-success-text">
                              Mark {student.fullName} complete?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setCompletingStudentId(null)}
                                className="px-3 py-1.5 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  student.activeEnrollment &&
                                  completeEnrollmentMutation.mutate({ enrollmentId: student.activeEnrollment.id })
                                }
                                disabled={completeEnrollmentMutation.isPending}
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
      </div>
      )}
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 shadow-sm border border-edge">
          <div className="text-sm text-tx-secondary">
            <span className="font-medium">{filteredStudents?.length || 0}</span> of{' '}
            <span className="font-medium">{data.pagination.total}</span> students
            {(statusFilter !== 'all' || programFilter !== 'all') && (
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
            setModalInitialTab('details');
          }}
          onBookLesson={handleBookLesson}
          prefillFromGuardian={selectedStudent ? undefined : guardianPrefill}
          onViewGuardian={handleSelectSearchedGuardian}
          initialTab={modalInitialTab}
        />
      )}

      {/* SmartBookingForm - for booking lessons */}
      {isSmartBookingOpen && (
        <ModalShell maxWidth="max-w-3xl">
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
        </ModalShell>
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
