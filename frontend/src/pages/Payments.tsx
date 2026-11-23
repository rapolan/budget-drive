import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Search, Plus, Check, X, LayoutGrid, LayoutList, Mail, Phone, History, ArrowUpDown, Users, TrendingUp, Download, Wallet } from 'lucide-react';
import { studentsApi, paymentsApi } from '@/api';
import { PaymentModal, PaymentHistoryModal, PaymentPeriodSummaryPanel, WhoOwesYouList } from '@/components/payments';
import type { Student, WhoOwesYouRow } from '@/types';
import { EmptyState, LoadingSpinner, BackButton, ToastContainer } from '@/components/common';
import type { DateRangeValue } from '@/components/common';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useSessionState } from '@/hooks/useSessionState';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/useToast';
import { getMonthBoundaries } from '@/utils/timeFormat';
import { formatMoney } from '@/utils/moneyFormat';

type ViewMode = 'table' | 'cards';
const isViewMode = (v: string): v is ViewMode => v === 'table' || v === 'cards';
// 'balance' sorts highest-outstanding-balance-first - "who owes the
// most," a genuinely new question this page couldn't answer before.
// 'date_newest'/'date_oldest' sort by payment CREATION date rather than
// anything about the student row - only meaningful once payments (not
// just students) are what's being ordered, but reuses the same
// sort-dropdown control instead of adding a second one.
// Matches Students.tsx's plain (non-persisted) useState<SortOption> -
// sort choice resets on reload, same as there.
type SortOption = 'name' | 'balance' | 'date_newest' | 'date_oldest';

export const PaymentsPage: React.FC = () => {
  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();
  const navigate = useNavigate();
  const { tenantNow } = useTenant();
  const { toasts, error: toastError, removeToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [viewMode, setViewMode] = useSessionState<ViewMode>('payments-view-mode', 'table', isViewMode);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  // Period summary's own date range - defaults to "This Month", not "All
  // Time". Starts at the 'all' preset because tenantNow (and therefore
  // the tenant-resolved month boundaries) isn't available synchronously
  // on first render - the effect below promotes it to 'this_month' the
  // moment tenantNow loads, but only while the user hasn't touched the
  // filter yet (tracked by defaultApplied, not by re-checking preset ===
  // 'all', since 'all' is also the user's own valid choice via the "All
  // Time" chip and must stay sticky once explicitly chosen).
  const [periodRange, setPeriodRange] = useState<DateRangeValue>({ start: '', end: '', preset: 'all' });
  const [defaultPeriodApplied, setDefaultPeriodApplied] = useState(false);

  // Fetch students
  const { data: studentsData, isLoading, error } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
  });

  // Fetch payments (for the "Total collected this month" summary card -
  // Student.paymentSummary only ever carries a lifetime total, not a
  // per-period one). Same paymentsApi.getAll(1, 1000) call Dashboard.tsx
  // already uses for its own monthly-revenue card.
  const { data: paymentsData } = useQuery({
    queryKey: ['payments'],
    queryFn: () => paymentsApi.getAll(1, 1000),
  });

  const students = studentsData?.data || [];
  const payments = paymentsData?.data || [];

  // Promote the period filter from 'all' to 'this_month' the moment
  // tenant-resolved month boundaries are available, but only once and
  // only if the user hasn't already made their own choice (switching to
  // "All Time", "Today", etc. before this fires must stick - this is a
  // one-time default, not a value that keeps re-asserting itself).
  useEffect(() => {
    if (defaultPeriodApplied || !tenantNow) return;
    setDefaultPeriodApplied(true);
    setPeriodRange({
      start: tenantNow.monthBoundaries.start,
      end: tenantNow.monthBoundaries.end,
      preset: 'this_month',
    });
  }, [tenantNow, defaultPeriodApplied]);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-64">
        <LoadingSpinner className="h-64" />
      </div>
    );
  }

  // Error state - show helpful message for auth errors
  if (error) {
    const is401Error = (error as any)?.response?.status === 401;

    if (is401Error) {
      return (
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-tx-primary">Payments & Balances</h1>
            <p className="mt-1 text-sm text-tx-muted">
              Track student payments and account balances
            </p>
          </div>

          {/* Auth Notice */}
          <div className="rounded-lg border-l-4 border-status-warning-border bg-status-warning-bg p-6">
            <h3 className="mb-2 font-semibold text-status-warning-text">Authentication Required</h3>
            <div className="space-y-2 text-sm text-status-warning-text">
              <p>
                This page requires authentication to load student payment data.
              </p>
              <p>
                <strong>For Development:</strong> Authentication and login functionality is being
                implemented. For now, you can:
              </p>
              <ul className="ml-6 list-disc space-y-1">
                <li>View the page layout and UI components</li>
                <li>See how the payment system will work once auth is set up</li>
                <li>Continue with other development tasks</li>
              </ul>
              <p className="mt-3">
                <strong>Next Steps:</strong> Implement login page and authentication flow to enable
                full payment tracking functionality.
              </p>
            </div>
          </div>

          {/* Preview of Page Layout */}
          <div className="rounded-lg bg-surface2 p-8 text-center">
            <DollarSign className="mx-auto h-16 w-16 text-tx-muted" />
            <p className="mt-4 text-sm text-tx-secondary">
              Payment tracking interface will appear here once authenticated
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-status-danger-bg border border-status-danger-border text-status-danger-text px-4 py-3 rounded">
        Error loading students data. Please try again.
      </div>
    );
  }

  // Payment info is derived server-side (Student.paymentSummary, from the
  // active driver_training enrollment's payments - never stored/cached),
  // mirroring how computeStudentProgress derives Student.progress. No
  // active enrollment means nothing to compute - status: 'unpaid' with
  // zeroes is the same "nothing owed, nothing paid" default a brand-new
  // student would show, not a special case.
  const getPaymentInfo = (student: typeof students[0]) => {
    const summary = student?.paymentSummary;
    if (!summary) {
      return {
        totalDue: 0,
        paid: 0,
        balance: 0,
        credit: 0,
        status: 'unpaid' as const,
      };
    }

    const totalPaid = summary.totalPaid;
    const outstandingBalance = summary.outstandingBalance ?? 0;
    const totalDue = totalPaid + outstandingBalance;

    return {
      totalDue,
      paid: totalPaid,
      balance: outstandingBalance,
      // "Paid, not yet scheduled" per student (item 3) - the same
      // creditBalance computePaymentSummary now computes, already combined
      // across BTW+DE by studentService.combinePaymentSummaries exactly
      // like outstandingBalance above. Shown only when positive.
      credit: summary.creditBalance ?? 0,
      status: summary.paymentStatus === 'unknown' ? ('unpaid' as const) : summary.paymentStatus,
    };
  };

  // Most recent payment CREATED date for a student (not lesson/enrollment
  // date) - same "derive one comparable date per student from a related
  // records array" shape as Students.tsx's getLastLessonDate/'last_lesson'
  // sort. Students with no payments have no createdAt to compare, so they
  // sort to the end regardless of direction, same as Students.tsx does for
  // no-lessons students.
  const getLastPaymentCreatedAt = (studentId: string): Date | null => {
    const studentPayments = payments.filter((p) => p.studentId === studentId);
    if (studentPayments.length === 0) return null;
    return studentPayments.reduce(
      (latest, p) => {
        const created = new Date(p.createdAt);
        return !latest || created > latest ? created : latest;
      },
      null as Date | null
    );
  };

  // Filter, then sort, students
  const filteredStudents = students
    .filter((student) => {
      const matchesSearch =
        student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

      if (!matchesSearch) return false;

      if (filterStatus === 'all') return true;

      const payment = getPaymentInfo(student);
      return payment.status === filterStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'balance') {
        return getPaymentInfo(b).balance - getPaymentInfo(a).balance;
      }
      if (sortBy === 'date_newest' || sortBy === 'date_oldest') {
        const aDate = getLastPaymentCreatedAt(a.id);
        const bDate = getLastPaymentCreatedAt(b.id);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return sortBy === 'date_newest'
          ? bDate.getTime() - aDate.getTime()
          : aDate.getTime() - bDate.getTime();
      }
      return a.fullName.localeCompare(b.fullName);
    });

  // "Students with a Balance" is the only figure still computed from the
  // page's own student list. The lifetime outstanding total that used to
  // live here ("Total Outstanding") was removed - it duplicated the
  // period panel's own "Outstanding" card, and the two could disagree:
  // this card summed Student.paymentSummary.outstandingBalance, which
  // getAllStudents already excludes archived students from, while
  // paymentReportingService's SQL originally summed every enrollment
  // tenant-wide with no such filter. Fixed by scoping that SQL to
  // archived_at IS NULL to match this page's own scope exactly, so now
  // there is one number instead of two that could silently drift apart
  // again - see paymentReportingService.ts's getPaymentPeriodSummary.
  const totals = students.reduce(
    (acc, student) => {
      const payment = getPaymentInfo(student);
      return {
        studentsWithBalance: acc.studentsWithBalance + (payment.balance > 0 ? 1 : 0),
      };
    },
    { studentsWithBalance: 0 }
  );

  // Total collected THIS MONTH (tenant-timezone month boundaries, never
  // client-clock derived - same tenantNow.monthBoundaries pattern
  // Dashboard.tsx's own monthlyRevenue card already uses). Distinct from
  // totals.totalPaid above, which is a lifetime figure.
  const sumConfirmedInRange = (start: string, end: string) =>
    payments
      .filter((p) => {
        const paymentDateStr = String(p.date).split('T')[0];
        return paymentDateStr >= start && paymentDateStr <= end && p.status === 'confirmed';
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const totalCollectedThisMonth = tenantNow
    ? sumConfirmedInRange(tenantNow.monthBoundaries.start, tenantNow.monthBoundaries.end)
    : 0;

  // Last month's collected total, for the trend comparison below - last
  // month's boundaries are derived from tenantNow.today via pure
  // calendar-month arithmetic (getMonthBoundaries), never the browser's
  // own clock. Matches Students.tsx's stats.newLastMonth in spirit (a
  // month-over-month comparison), but tenant-time-correct from the start.
  const lastMonthBoundaries = tenantNow ? getMonthBoundaries(tenantNow.today, -1) : null;
  const totalCollectedLastMonth = lastMonthBoundaries
    ? sumConfirmedInRange(lastMonthBoundaries.start, lastMonthBoundaries.end)
    : 0;
  const collectedDiffVsLastMonth = totalCollectedThisMonth - totalCollectedLastMonth;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-status-success-bg text-status-success-text';
      case 'partial':
        return 'bg-status-warning-bg text-status-warning-text';
      case 'unpaid':
        return 'bg-status-danger-bg text-status-danger-text';
      default:
        return 'bg-surface2 text-tx-primary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <Check className="h-4 w-4" />;
      case 'unpaid':
        return <X className="h-4 w-4" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };

  // CSV export for the period panel's own date range, falling back to
  // "this month" the same way PaymentPeriodSummaryPanel's own query does
  // when no explicit range is selected yet - same blob/anchor-click
  // pattern StudentModal.tsx's transcript download already uses.
  const handleExportCsv = async () => {
    const start = periodRange.start || tenantNow?.monthBoundaries.start;
    const end = periodRange.end || tenantNow?.monthBoundaries.end;
    if (!start || !end) return;

    const csvText = await paymentsApi.exportCsv(start, end);
    const blob = new Blob([csvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments-${start}-to-${end}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // "Who owes you" rows carry a studentId, but PaymentHistoryModal/
  // PaymentModal need a full Student object. Resolved from the students
  // list already fetched for this page's own table first (cheap, no
  // request); falls back to a direct by-id fetch when the student isn't
  // in that loaded list (payments-actions, item 5 fix - this previously
  // silently did nothing, same "fetch by id if not cached" pattern
  // Students.tsx's own handleSelectSearchedStudent already uses). An
  // error toast surfaces the rare case where even that fetch fails
  // (network error, or the student was deleted between the who-owes-you
  // query and the click), rather than failing silently a second time.
  const resolveOwingStudent = async (row: WhoOwesYouRow): Promise<Student | null> => {
    const cached = students.find((s) => s.id === row.studentId);
    if (cached) return cached;
    try {
      const response = await studentsApi.getById(row.studentId);
      return response.data ?? null;
    } catch (err) {
      console.error('Failed to fetch student for "who owes you" row:', err);
      toastError('Could not load this student', 'Please try again, or search for them directly below.');
      return null;
    }
  };

  const handleSelectOwingStudent = async (row: WhoOwesYouRow) => {
    const resolved = await resolveOwingStudent(row);
    if (resolved) {
      setSelectedStudent(resolved);
      setIsHistoryModalOpen(true);
    }
  };

  const handleRecordPaymentForOwingStudent = async (row: WhoOwesYouRow) => {
    const resolved = await resolveOwingStudent(row);
    if (resolved) {
      setSelectedStudent(resolved);
      setIsPaymentModalOpen(true);
    }
  };

  // "Record payment" from inside the history modal (item 1) - closes the
  // history view and opens the existing PaymentModal for the same
  // student, pre-filled from their current outstandingBalance exactly as
  // PaymentModal already does for every other caller (no new pre-fill
  // logic needed here).
  const handleRecordPaymentFromHistory = () => {
    setIsHistoryModalOpen(false);
    setIsPaymentModalOpen(true);
  };

  // "Link to the student's record" (item 4) - Students.tsx has its own
  // StudentModal and no route of its own to deep-link into, so this
  // mirrors the existing Dashboard.tsx -> Students.tsx `location.state`
  // filter deep-link convention (see Students.tsx's own effect) rather
  // than inventing a new navigation mechanism.
  const handleViewStudentRecord = (studentId: string) => {
    navigate('/students', { state: { openStudentId: studentId } });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-2xl font-bold text-tx-primary mt-2">Payments & Balances</h1>
          <p className="mt-1 text-sm text-tx-muted">
            Track student payments and account balances
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-edge bg-surface p-1">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-primary/10 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
              title="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-primary/10 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center justify-center rounded-lg border border-edge-strong bg-surface px-4 py-2 text-tx-secondary hover:bg-surface2 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all"
            title="Export payments for the selected period as CSV"
          >
            <Download className="mr-2 h-5 w-5 flex-shrink-0" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedStudent(null);
              setIsPaymentModalOpen(true);
            }}
            className="flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all"
          >
            <Plus className="mr-2 h-5 w-5 flex-shrink-0" />
            Record Payment
          </button>
        </div>
      </div>

      {/* Period summary - chips (Today/This Week/This Month/Custom) plus
          Collected/Refunded/Net/Outstanding/Paid-not-yet-scheduled cards
          and a collected-by-method breakdown, all scoped to the selected
          period. "Outstanding" here and "Collected This Calendar Month"
          below are deliberately different figures now (one point-in-time
          tenant-wide balance, one fixed-to-this-month collected amount) -
          see the removed "Total Outstanding" card's comment below for the
          duplicate-figure bug this replaced. */}
      <PaymentPeriodSummaryPanel range={periodRange} onRangeChange={setPeriodRange} />

      {/* "Who owes you" - counts only lessons that have already happened,
          aged from the oldest unpaid completed lesson. */}
      <WhoOwesYouList
        onSelectStudent={handleSelectOwingStudent}
        onRecordPayment={handleRecordPaymentForOwingStudent}
      />

      {/* Summary Stats - matches Students.tsx's stat-card treatment
          (tokens, rounded-xl/border-edge/shadow-sm, icon chip + value
          block), not the previous hand-rolled rounded-lg/shadow cards.
          The "Total Outstanding" card that used to sit here was removed -
          it duplicated the period panel's own "Outstanding" card above
          (see the `totals` comment for why they could disagree before the
          SQL fix). "Collected This Month" is kept and relabeled, since it
          is genuinely different information: it is always THIS calendar
          month with a month-over-month trend, regardless of whatever
          period chip is selected above, whereas the panel's "Collected"
          card tracks whichever period is currently selected. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-success-bg rounded-lg">
              <DollarSign className="h-5 w-5 text-status-success-text" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-status-success-text">{formatMoney(totalCollectedThisMonth)}</p>
            <p className="text-sm text-tx-muted">Collected This Calendar Month (fixed, not the period chip above)</p>
            {/* Month-over-month trend - same icon/styling treatment as
                Students.tsx's "New This Month" comparison (TrendingUp,
                rotated 180deg when negative, success/danger token pair). */}
            <p className={`flex items-center text-xs font-medium mt-1 ${
              collectedDiffVsLastMonth >= 0 ? 'text-status-success-text' : 'text-status-danger-text'
            }`}>
              <TrendingUp className={`h-3 w-3 mr-1 ${collectedDiffVsLastMonth < 0 ? 'rotate-180' : ''}`} />
              {collectedDiffVsLastMonth >= 0 ? '+' : '-'}{formatMoney(Math.abs(collectedDiffVsLastMonth))} vs last month ({formatMoney(totalCollectedLastMonth)})
            </p>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-status-info-bg rounded-lg">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">{totals.studentsWithBalance}</p>
            <p className="text-sm text-tx-muted">Students with a Balance</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg bg-surface p-4 shadow">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Search */}
          <div className="flex items-center rounded-md border border-edge-strong bg-surface px-4 py-2">
            <Search className="h-5 w-5 text-tx-muted" />
            <input
              type="text"
              placeholder="Search by student name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="nope"
              className="ml-2 flex-1 border-none bg-transparent outline-none"
            />
          </div>

          {/* Sort - matches Students.tsx's sort-dropdown pattern
              (ArrowUpDown icon + plain native select). "balance" is the
              genuinely new option: highest-outstanding-balance-first. */}
          <div className="flex items-center gap-2 rounded-md border border-edge-strong bg-surface px-4 py-2">
            <ArrowUpDown className="h-4 w-4 text-tx-muted flex-shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              title="Sort students by"
              aria-label="Sort students by"
              className="flex-1 text-sm border-none bg-transparent text-tx-secondary focus:ring-0 cursor-pointer"
            >
              <option value="name">Name A-Z</option>
              <option value="balance">Highest Balance First</option>
              <option value="date_newest">Payment Date (Newest First)</option>
              <option value="date_oldest">Payment Date (Oldest First)</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            title="Filter by payment status"
            aria-label="Filter by payment status"
            className="rounded-md border border-edge-strong px-4 py-2 focus:border-primary focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid in Full</option>
            <option value="partial">Partial Payment</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Card View - Mobile Friendly */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={<DollarSign className="h-12 w-12" />}
                title="No payment records found"
                description={
                  filterStatus !== 'all'
                    ? `No students match the selected payment status filter.`
                    : searchTerm
                    ? `No payment records match your search for "${searchTerm}"`
                    : "No student payment records available"
                }
              />
            </div>
          ) : (
            filteredStudents.map((student) => {
              const payment = getPaymentInfo(student);
              const progressPercent = payment.totalDue > 0 ? (payment.paid / payment.totalDue) * 100 : 0;

              return (
                <div
                  key={student.id}
                  className={`bg-surface rounded-xl shadow-sm border-2 p-5 hover:shadow-md transition-all ${
                    payment.status === 'paid' ? 'border-status-success-border' :
                    payment.status === 'unpaid' ? 'border-status-danger-border' :
                    'border-edge hover:brightness-110 hover:border-primary'
                  }`}
                >
                  {/* Header - Student Name & Status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-tx-primary truncate">{student.fullName}</h3>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${getStatusBadge(payment.status)}`}
                        >
                          {getStatusIcon(payment.status)}
                          {payment.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-tx-secondary">Payment Progress</span>
                      <span className="font-medium text-tx-primary">
                        {Math.round(progressPercent)}%
                      </span>
                    </div>
                    <div className="h-2 bg-surface3 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progressPercent >= 100 ? 'bg-status-success-text' : progressPercent >= 50 ? 'bg-primary' : 'bg-status-warning-text'
                        }`}
                        style={{ width: `${Math.min(100, progressPercent)}%` }}
                      />
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="bg-surface2 rounded-lg p-2">
                      <div className="text-xs text-tx-muted">Total Due</div>
                      <div className="text-sm font-semibold text-tx-primary">{formatMoney(payment.totalDue)}</div>
                    </div>
                    <div className="bg-status-success-bg rounded-lg p-2">
                      <div className="text-xs text-tx-muted">Paid</div>
                      <div className="text-sm font-semibold text-status-success-text">{formatMoney(payment.paid)}</div>
                    </div>
                    <div className={`rounded-lg p-2 ${payment.balance > 0 ? 'bg-status-danger-bg' : 'bg-status-success-bg'}`}>
                      <div className="text-xs text-tx-muted">Balance</div>
                      <div className={`text-sm font-semibold ${payment.balance > 0 ? 'text-status-danger-text' : 'text-status-success-text'}`}>
                        {formatMoney(payment.balance)}
                      </div>
                    </div>
                  </div>

                  {/* "Paid, not yet scheduled" (item 3) - shown only when
                      positive, same creditBalance the period panel sums
                      tenant-wide. */}
                  {payment.credit > 0 && (
                    <div className="mb-4 rounded-lg bg-status-info-bg p-2 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-tx-secondary">
                        <Wallet className="h-3.5 w-3.5" />
                        Paid, not yet scheduled
                      </span>
                      <span className="font-semibold text-primary">{formatMoney(payment.credit)}</span>
                    </div>
                  )}

                  {/* Contact Info */}
                  <div className="space-y-1 mb-4 text-sm">
                    {student.email && (
                      <a href={`mailto:${student.email}`} className="flex items-center gap-2 text-tx-secondary hover:text-primary truncate">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{student.email}</span>
                      </a>
                    )}
                    {student.phone && (
                      <a href={`tel:${student.phone}`} className="flex items-center gap-2 text-tx-secondary hover:text-primary">
                        <Phone className="h-4 w-4 flex-shrink-0" />
                        {student.phone}
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-edge">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudent(student);
                        setIsPaymentModalOpen(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 hover:bg-primary transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Add Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudent(student);
                        setIsHistoryModalOpen(true);
                      }}
                      className="p-2 text-tx-secondary hover:text-primary hover:bg-status-info-bg rounded-lg transition-colors"
                      title="View History"
                    >
                      <History className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Payments Table */}
      {viewMode === 'table' && (
      <div className="rounded-lg bg-surface shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-edge">
            <thead className="bg-surface2">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                  Contact
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-tx-muted">
                  Total Due
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-tx-muted">
                  Paid
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-tx-muted">
                  Balance
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-tx-muted">
                  Paid, Not Yet Scheduled
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-tx-muted">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge bg-surface">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-2">
                    <EmptyState
                      icon={<DollarSign className="h-12 w-12" />}
                      title="No payment records found"
                      description={
                        filterStatus !== 'all'
                          ? `No students match the selected payment status filter. Try changing the filter.`
                          : searchTerm
                          ? `No payment records match your search for "${searchTerm}"`
                          : "No student payment records available"
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                  const payment = getPaymentInfo(student);

                  return (
                    <tr
                      key={student.id}
                      className="group hover:bg-surface2 cursor-pointer"
                      onClick={() => {
                        setSelectedStudent(student);
                        setIsHistoryModalOpen(true);
                      }}
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-tx-primary">
                          {student.fullName}
                        </div>
                        {/* Row actions - under the student name, hover-
                            reveal on desktop / always-visible on touch,
                            matching Students.tsx/Lessons.tsx exactly.
                            min-h-[28px] is unconditional so a hovered row
                            never reflows its neighbors. */}
                        <div className="min-h-[28px] flex items-center gap-1 mt-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudent(student);
                              setIsPaymentModalOpen(true);
                            }}
                            aria-label="Add payment"
                            title="Add payment"
                            className="p-1.5 text-primary hover:brightness-75 hover:bg-status-info-bg rounded-lg transition-all hover:scale-110"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudent(student);
                              setIsHistoryModalOpen(true);
                            }}
                            aria-label="View payment history"
                            title="View history"
                            className="p-1.5 text-tx-secondary hover:brightness-75 hover:bg-status-info-bg rounded-lg transition-all hover:scale-110"
                          >
                            <History className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm text-tx-muted">{student.email || student.phone || '—'}</div>
                        <div className="text-sm text-tx-muted">{student.phone}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="text-sm font-medium text-tx-primary">
                          {formatMoney(payment.totalDue)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="text-sm font-medium text-status-success-text">
                          {formatMoney(payment.paid)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div
                          className={`text-sm font-medium ${
                            payment.balance > 0 ? 'text-status-danger-text' : 'text-status-success-text'
                          }`}
                        >
                          {formatMoney(payment.balance)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        {payment.credit > 0 ? (
                          <div className="text-sm font-medium text-primary">{formatMoney(payment.credit)}</div>
                        ) : (
                          <div className="text-sm text-tx-muted">—</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${getStatusBadge(
                            payment.status
                          )}`}
                        >
                          {getStatusIcon(payment.status)}
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* BDP Integration Notice */}
      <div className="rounded-lg border-l-4 border-primary bg-status-info-bg p-6">
        <h3 className="mb-2 font-semibold text-status-info-text">Budget Drive Protocol Integration</h3>
        <div className="space-y-2 text-sm text-status-info-text">
          <p>
            Payment tracking is integrated with the Budget Drive Protocol (BDP) treasury system.
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Every lesson booking generates a 5-sat BDP fee (~$0.00000235 USD)</li>
            <li>Fees are tracked in the Treasury page</li>
            <li>Student payments flow through the multi-tenant accounting system</li>
            <li>Instructor earnings are calculated with BDP fees deducted</li>
          </ul>
          <p className="mt-3">
            <strong>Note:</strong> This is a simplified view. In production, this would integrate
            with payment processors (Stripe, Square, etc.) and the blockchain treasury.
          </p>
        </div>
      </div>

      {/* Modals */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
      />

      <PaymentHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
        onRecordPayment={handleRecordPaymentFromHistory}
        onViewStudentRecord={handleViewStudentRecord}
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};
