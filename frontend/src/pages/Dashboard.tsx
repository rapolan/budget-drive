import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Calendar as CalendarIcon,
  DollarSign,
  Clock,
  User,
  Users,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  Phone,
  ChevronRight,
  Cake,
  UserX,
  ClipboardCheck,
  FileWarning,
  X
} from 'lucide-react';
import { studentsApi, instructorsApi, lessonsApi, paymentsApi, dashboardApi } from '@/api';
import type { Student } from '@/types';
import { StudentModal } from '@/components/students/StudentModal';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { SmartBookingForm } from '@/components/scheduling/SmartBookingForm';
import { ModalShell } from '@/components/common/ModalShell';
import { DashboardSkeleton } from '@/components/common/Skeleton';
import { format12Hour, formatTenantDateLabel, parseLocalDate, addCalendarDays } from '@/utils/timeFormat';
import { computeStudentStatus } from '@/utils/studentStatus';
import { needsTurning18Alert } from '@/utils/turning18';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenantNow } = useTenant();
  const isInstructor = user?.role === 'instructor';

  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  // Book Lesson opens SmartBookingForm in place on the dashboard (matching
  // the create-student modal's own same-page behavior) instead of
  // navigating to /lessons - studentForBooking is only ever set when
  // opened from the create-student modal's own "Book Lesson" follow-up
  // (a freshly created student has no prior lesson to prefill from,
  // matching StudentModal's own onBookLesson(createdStudent, null) call
  // shape); the two general "Schedule Lesson" entry points below leave it
  // unset for a blank booking, same as Lessons.tsx's own blank-booking
  // entry point with no preselected student.
  const [isSmartBookingOpen, setIsSmartBookingOpen] = useState(false);
  const [studentForBooking, setStudentForBooking] = useState<Student | null>(null);

  // Fetch data
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
  });

  const { data: instructorsData, isLoading: instructorsLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const { data: lessonsData, isLoading: lessonsLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonsApi.getAll(1, 1000),
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['payments'],
    queryFn: () => paymentsApi.getAll(1, 1000),
    enabled: !isInstructor,
  });

  const { data: noShowAlertsData } = useQuery({
    queryKey: ['dashboard', 'no-show-alerts'],
    queryFn: () => dashboardApi.getNoShowAlerts(),
  });

  const { data: reviewQueueData } = useQuery({
    queryKey: ['dashboard', 'review-queue'],
    queryFn: () => dashboardApi.getReviewQueue(),
  });

  const { data: licenseExpiryAlertsData } = useQuery({
    queryKey: ['dashboard', 'license-expiry-alerts'],
    queryFn: () => dashboardApi.getLicenseExpiryAlerts(),
  });

  const queryClient = useQueryClient();
  const dismissAlertMutation = useMutation({
    mutationFn: (notificationId: string) => dashboardApi.dismissAlert(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'no-show-alerts'] });
    },
  });

  // Dashboard only ever books a blank lesson or one for a just-created
  // student (never "book again" with prior-lesson prefill), so this is
  // the simple form of the handler - Students.tsx's own handleBookLesson
  // additionally handles prefill from a prior lesson, not needed here.
  const handleBookLesson = (student: Student) => {
    setStudentForBooking(student);
    setIsSmartBookingOpen(true);
  };

  const handleBookingComplete = () => {
    setIsSmartBookingOpen(false);
    setStudentForBooking(null);
    queryClient.invalidateQueries({ queryKey: ['lessons'] });
  };

  const students = studentsData?.data || [];
  const instructors = instructorsData?.data || [];
  const lessons = lessonsData?.data || [];
  const payments = paymentsData?.data || [];
  const noShowAlerts = noShowAlertsData?.data || [];
  const reviewQueueCount = reviewQueueData?.data?.totalCount || 0;
  const licenseExpiryAlerts = licenseExpiryAlertsData?.data || [];

  // tenantNow is null only during the brief pre-hydration window before
  // TenantContext's first fetch resolves - the loading gate below renders
  // the skeleton for that window rather than ever falling back to a
  // browser-derived date (see docs/ARCHITECTURE.md §7).
  const isLoading = studentsLoading || instructorsLoading || lessonsLoading || !tenantNow;

  // ============================================
  // DASHBOARD STATS
  // ============================================
  
  // computeStudentStatus requires an explicit tenant-resolved "now" - falls
  // back to a fixed placeholder only for the brief pre-hydration window
  // these memos also run through (the page itself renders its loading
  // skeleton during that window, so this value is never actually shown).
  const statusNow = tenantNow ? parseLocalDate(tenantNow.today) : new Date(0);

  // Active students count (scheduled + ready to book = students in the pipeline)
  const activeStudents = useMemo(() => {
    return students.filter(s => {
      const statusInfo = computeStudentStatus(s, lessons, statusNow, s.activeEnrollment ?? null);
      return statusInfo.status === 'scheduled' || statusInfo.status === 'ready_to_book';
    });
  }, [students, lessons, statusNow]);

  // Students needing attention
  const studentsNeedingAttention = useMemo(() => {
    return students.filter(s => computeStudentStatus(s, lessons, statusNow, s.activeEnrollment ?? null).status === 'needs_attention');
  }, [students, lessons, statusNow]);

  // Permits expiring within 30 days of the TENANT's today - lessonDate/
  // learnerPermitExpiration arrive as DATE-only values (no wall-clock time),
  // so this compares them as plain YYYY-MM-DD strings rather than round-
  // tripping through a browser-local Date.
  const expiringPermits = useMemo(() => {
    if (!tenantNow) return [];
    const thirtyDaysFromToday = addCalendarDays(tenantNow.today, 30);

    return students.filter(s => {
      if (!s.learnerPermitExpiration) return false;
      const expDateStr = String(s.learnerPermitExpiration).split('T')[0];
      return expDateStr <= thirtyDaysFromToday && expDateStr >= tenantNow.today;
    });
  }, [students, tenantNow]);

  // This month's revenue, in the tenant's own month boundaries.
  const monthlyRevenue = useMemo(() => {
    if (!tenantNow) return 0;
    return payments
      .filter(p => {
        const paymentDateStr = String(p.date).split('T')[0];
        return paymentDateStr >= tenantNow.monthBoundaries.start && p.status === 'confirmed';
      })
      .reduce((sum, p) => sum + (+p.amount || 0), 0);
  }, [payments, tenantNow]);

  // Pending payments
  const pendingPayments = useMemo(() => {
    return payments.filter(p => p.status === 'pending');
  }, [payments]);

  // Students who turned 18 mid-program and are under-booked (Constraint B)
  const studentsTurning18 = useMemo(() => {
    return students.filter(needsTurning18Alert);
  }, [students]);

  // This week's lessons count, in the tenant's own week boundaries.
  const weekLessonsCount = useMemo(() => {
    if (!tenantNow) return 0;
    return lessons.filter(l => {
      const lessonDateStr = String(l.date).split('T')[0];
      return lessonDateStr >= tenantNow.weekStart && lessonDateStr <= tenantNow.weekEnd && l.status === 'scheduled';
    }).length;
  }, [lessons, tenantNow]);

  // Today's lessons, by the TENANT's calendar date.
  const todaysLessons = useMemo(() => {
    if (!tenantNow) return [];
    return lessons
      .filter((l) => String(l.date).split('T')[0] === tenantNow.today && l.status === 'scheduled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [lessons, tenantNow]);

  // Current and next lesson, against the tenant's current wall-clock time.
  const currentTime = tenantNow?.currentTime ?? '';
  const currentLesson = useMemo(() => {
    return todaysLessons.find(
      (l) => l.startTime <= currentTime && l.endTime > currentTime
    );
  }, [todaysLessons, currentTime]);

  const nextLesson = useMemo(() => {
    return todaysLessons.find((l) => l.startTime > currentTime);
  }, [todaysLessons, currentTime]);

  const completedLessons = useMemo(() => {
    return todaysLessons.filter((l) => l.endTime <= currentTime);
  }, [todaysLessons, currentTime]);

  const upcomingLessons = useMemo(() => {
    return todaysLessons.filter((l) => l.startTime > currentTime);
  }, [todaysLessons, currentTime]);

  // Get next 7 days of lessons, walking forward from the tenant's today.
  const weeklyLessons = useMemo(() => {
    if (!tenantNow) return [];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = addCalendarDays(tenantNow.today, i);

      const dayLessons = lessons.filter((l) => {
        return String(l.date).split('T')[0] === dateStr && l.status === 'scheduled';
      });

      days.push({
        date: parseLocalDate(dateStr),
        lessons: dayLessons,
        count: dayLessons.length,
        isToday: i === 0,
      });
    }
    return days;
  }, [lessons, tenantNow]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const formatDayShort = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const formatDayDate = (date: Date) => {
    return date.getDate();
  };

  return (
    <div className="min-h-full">

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">

        {/* ── Page title + quick actions ─────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-tx-primary">{tenantNow ? formatTenantDateLabel(tenantNow.today) : ''}</h1>
            <p className="mt-1 text-sm text-tx-muted">
              {todaysLessons.length === 0
                ? 'No lessons scheduled today'
                : `${todaysLessons.length} lesson${todaysLessons.length > 1 ? 's' : ''} scheduled today`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsStudentModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface border border-edge rounded-lg text-tx-secondary hover:bg-surface2 transition-colors text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Student
            </button>
            <button
              type="button"
              onClick={() => setIsSmartBookingOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:brightness-90 transition-all text-sm font-medium"
            >
              <CalendarIcon className="h-4 w-4" />
              Schedule Lesson
            </button>
            {!isInstructor && (
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-edge rounded-lg text-tx-secondary hover:bg-surface2 transition-colors text-sm font-medium"
              >
                <DollarSign className="h-4 w-4" />
                Payment
              </button>
            )}
          </div>
        </div>

        {/* ── Main grid ──────────────────────────────────────────────── */}
        {/* Desktop: schedule left (7), sidebar right (5)
            Mobile: sidebar content reordered by CSS order */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left — Today's Schedule ──────────────────────────────── */}
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div className="bg-surface rounded-xl border border-edge overflow-hidden flex flex-col h-full">
              <div className="px-5 py-4 border-b border-edge bg-surface2 flex items-center justify-between">
                <h2 className="font-semibold text-tx-primary">Today's Schedule</h2>
                <button
                  type="button"
                  onClick={() => navigate('/lessons')}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  View all →
                </button>
              </div>

              {todaysLessons.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center flex-1">
                  <CalendarIcon className="h-12 w-12 text-tx-muted mb-3" />
                  <p className="font-medium text-tx-primary mb-1">No lessons today</p>
                  <p className="text-sm text-tx-muted mb-4">Enjoy your day off!</p>
                  <button
                    type="button"
                    onClick={() => setIsSmartBookingOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:brightness-90 transition-all text-sm font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Schedule a Lesson
                  </button>
                </div>
              ) : (
                <div className="flex flex-col flex-1 overflow-hidden">

                  {/* Progress strip */}
                  <div className="px-5 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex gap-4">
                        <span className="text-xs font-medium text-status-success-text">
                          {completedLessons.length} completed
                        </span>
                        <span className="text-xs font-medium text-tx-muted">
                          {upcomingLessons.length} remaining
                        </span>
                      </div>
                      <span className="text-xs text-tx-muted">
                        {todaysLessons.length} total
                      </span>
                    </div>
                    <div className="bg-surface2 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-status-success-text h-full transition-all duration-500"
                        style={{ width: `${(completedLessons.length / todaysLessons.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Current lesson banner */}
                  {currentLesson && (
                    <div className="mx-5 mb-3 bg-primary rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white/70 uppercase tracking-wider">In progress</span>
                        <Clock className="h-4 w-4 text-white/70" />
                      </div>
                      <p className="font-semibold text-white">
                        {students.find(s => s.id === currentLesson.studentId)?.fullName || 'Unknown Student'}
                      </p>
                      <p className="text-xs text-white/70 mt-0.5">
                        {format12Hour(currentLesson.startTime)} – {format12Hour(currentLesson.endTime)} · {instructors.find(i => i.id === currentLesson.instructorId)?.fullName || 'Unknown Instructor'}
                      </p>
                    </div>
                  )}

                  {/* Next lesson banner (only when nothing is active) */}
                  {nextLesson && !currentLesson && (
                    <div className="mx-5 mb-3 bg-primary/10 border border-primary/20 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">Up next</span>
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <p className="font-semibold text-tx-primary">
                        {students.find(s => s.id === nextLesson.studentId)?.fullName || 'Unknown Student'}
                      </p>
                      <p className="text-xs text-tx-muted mt-0.5">
                        {format12Hour(nextLesson.startTime)} – {format12Hour(nextLesson.endTime)} · {instructors.find(i => i.id === nextLesson.instructorId)?.fullName || 'Unknown Instructor'}
                      </p>
                    </div>
                  )}

                  {/* All done state */}
                  {completedLessons.length === todaysLessons.length && (
                    <div className="mx-5 mb-3 bg-status-success-bg border border-status-success-border rounded-lg p-4 text-center">
                      <p className="text-2xl mb-1">🎉</p>
                      <p className="font-semibold text-status-success-text">All done for today!</p>
                      <p className="text-xs text-tx-muted mt-0.5">{completedLessons.length} lesson{completedLessons.length > 1 ? 's' : ''} completed</p>
                    </div>
                  )}

                  {/* Lesson list */}
                  <div className="flex-1 overflow-y-auto px-5 pb-5">
                    <div className="space-y-2">
                      {todaysLessons.map((lesson) => {
                        const student = students.find(s => s.id === lesson.studentId);
                        const instructor = instructors.find(i => i.id === lesson.instructorId);
                        const isPast = lesson.endTime <= currentTime;
                        const isNow = lesson.startTime <= currentTime && lesson.endTime > currentTime;
                        return (
                          <div
                            key={lesson.id}
                            onClick={() => navigate('/lessons')}
                            className={`rounded-lg border px-4 py-3 cursor-pointer transition-all ${
                              isNow
                                ? 'border-primary/40 bg-primary/10'
                                : isPast
                                ? 'border-edge opacity-40'
                                : 'border-edge hover:border-edge-strong hover:bg-surface2'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <Clock className="h-3.5 w-3.5 flex-shrink-0 text-tx-muted" />
                                <span className="text-sm font-medium text-tx-primary truncate">
                                  {format12Hour(lesson.startTime)} – {format12Hour(lesson.endTime)}
                                </span>
                              </div>
                              {isNow && (
                                <span className="ml-2 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-white font-semibold">
                                  Now
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 min-w-0">
                              <User className="h-3.5 w-3.5 flex-shrink-0 text-tx-muted" />
                              <span className="text-sm text-tx-secondary truncate">
                                {student?.fullName || 'Unknown'} · {instructor?.fullName || 'Unknown'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>
          </div>

          {/* ── Right — Stats + Week + Alerts ───────────────────────── */}
          <div className="lg:col-span-5 order-1 lg:order-2 flex flex-col gap-4">

            {/* Stats — compact rows */}
            <div className="bg-surface rounded-xl border border-edge overflow-hidden">
              <button
                type="button"
                onClick={() => navigate('/students')}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface2 transition-colors border-b border-edge group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm text-tx-secondary">Active Students</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-tx-primary">{activeStudents.length}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-tx-muted group-hover:text-primary transition-colors" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/lessons', { state: { scrollToTable: true } })}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface2 transition-colors border-b border-edge group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-status-success-bg rounded-md">
                    <CalendarIcon className="h-4 w-4 text-status-success-text" />
                  </div>
                  <span className="text-sm text-tx-secondary">Lessons This Week</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-tx-primary">{weekLessonsCount}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-tx-muted group-hover:text-primary transition-colors" />
                </div>
              </button>

              {!isInstructor && (
                <button
                  type="button"
                  onClick={() => navigate('/payments')}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface2 transition-colors border-b border-edge group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-purple-500/10 rounded-md">
                      <TrendingUp className="h-4 w-4 text-purple-600" />
                    </div>
                    <span className="text-sm text-tx-secondary">Revenue This Month</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-tx-primary">
                      ${monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-tx-muted group-hover:text-primary transition-colors" />
                  </div>
                </button>
              )}

              {!isInstructor && (
                <button
                  type="button"
                  onClick={() => navigate('/instructors')}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface2 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-status-warning-bg rounded-md">
                      <User className="h-4 w-4 text-status-warning-text" />
                    </div>
                    <span className="text-sm text-tx-secondary">Active Instructors</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-tx-primary">{instructors.filter(i => i.status === 'active').length}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-tx-muted group-hover:text-primary transition-colors" />
                  </div>
                </button>
              )}
            </div>

            {/* Next 7 days */}
            <div className="bg-surface rounded-xl border border-edge overflow-hidden">
              <div className="px-5 py-4 border-b border-edge bg-surface2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-tx-primary">Next 7 Days</h2>
                <button
                  type="button"
                  onClick={() => navigate('/lessons')}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  View all →
                </button>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-7 gap-1">
                  {weeklyLessons.map((day, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => navigate('/lessons')}
                      className={`flex flex-col items-center py-2.5 px-1 rounded-lg border transition-all ${
                        day.isToday
                          ? 'border-primary/40 bg-primary/10'
                          : day.count > 0
                          ? 'border-edge hover:border-primary/30 hover:bg-primary/5'
                          : 'border-transparent hover:bg-surface2'
                      }`}
                    >
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${day.isToday ? 'text-primary' : 'text-tx-muted'}`}>
                        {formatDayShort(day.date)}
                      </span>
                      <span className={`text-base font-bold leading-tight my-0.5 ${day.isToday ? 'text-primary' : 'text-tx-primary'}`}>
                        {formatDayDate(day.date)}
                      </span>
                      {day.count > 0 ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          day.isToday ? 'bg-primary text-white' : 'bg-primary/15 text-primary'
                        }`}>
                          {day.count}
                        </span>
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-surface3 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Alerts — only rendered when there's something to show */}
            {(studentsNeedingAttention.length > 0 || expiringPermits.length > 0 || pendingPayments.length > 0 || studentsTurning18.length > 0 || noShowAlerts.length > 0 || reviewQueueCount > 0 || licenseExpiryAlerts.length > 0) && (
              <div className="bg-surface rounded-xl border border-edge overflow-hidden">
                <div className="px-5 py-4 border-b border-edge bg-surface2">
                  <h2 className="text-sm font-semibold text-tx-primary">Alerts</h2>
                </div>
                <div className="divide-y divide-edge">

                  {studentsNeedingAttention.length > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/students', { state: { filter: 'needs_attention' } })}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors text-left group"
                    >
                      <div className="p-1.5 bg-status-warning-bg border border-status-warning-border rounded-md flex-shrink-0">
                        <Phone className="h-4 w-4 text-status-warning-text" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-tx-primary">Needs Attention</p>
                        <p className="text-xs text-tx-muted truncate">
                          {studentsNeedingAttention.length === 1
                            ? `${studentsNeedingAttention[0].fullName}`
                            : `${studentsNeedingAttention.length} students`}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-status-warning-bg border border-status-warning-border text-status-warning-text">
                        {studentsNeedingAttention.length}
                      </span>
                    </button>
                  )}

                  {expiringPermits.length > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/students')}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors text-left group"
                    >
                      <div className="p-1.5 bg-status-danger-bg border border-status-danger-border rounded-md flex-shrink-0">
                        <AlertTriangle className="h-4 w-4 text-status-danger-text" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-tx-primary">Permits Expiring</p>
                        <p className="text-xs text-tx-muted truncate">
                          {expiringPermits.length === 1
                            ? `${expiringPermits[0].fullName}`
                            : `${expiringPermits.length} within 30 days`}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-status-danger-bg border border-status-danger-border text-status-danger-text">
                        {expiringPermits.length}
                      </span>
                    </button>
                  )}

                  {licenseExpiryAlerts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/instructors')}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors text-left group"
                    >
                      {(() => {
                        const hasDanger = licenseExpiryAlerts.some((a) => a.severity === 'danger');
                        const bgClass = hasDanger ? 'bg-status-danger-bg border-status-danger-border' : 'bg-status-warning-bg border-status-warning-border';
                        const textClass = hasDanger ? 'text-status-danger-text' : 'text-status-warning-text';
                        return (
                          <>
                            <div className={`p-1.5 ${bgClass} border rounded-md flex-shrink-0`}>
                              <FileWarning className={`h-4 w-4 ${textClass}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-tx-primary">Instructor Licenses</p>
                              <p className="text-xs text-tx-muted truncate">
                                {licenseExpiryAlerts.length === 1
                                  ? `${licenseExpiryAlerts[0].instructorName} - ${licenseExpiryAlerts[0].daysUntilExpiry < 0 ? 'expired' : `expires in ${licenseExpiryAlerts[0].daysUntilExpiry} days`}`
                                  : `${licenseExpiryAlerts.length} instructors - licenses expiring`}
                              </p>
                            </div>
                            <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${bgClass} border ${textClass}`}>
                              {licenseExpiryAlerts.length}
                            </span>
                          </>
                        );
                      })()}
                    </button>
                  )}

                  {studentsTurning18.length > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/students', { state: { filter: 'turning_18' } })}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors text-left group"
                    >
                      <div className="p-1.5 bg-status-warning-bg border border-status-warning-border rounded-md flex-shrink-0">
                        <Cake className="h-4 w-4 text-status-warning-text" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-tx-primary">Turning 18</p>
                        <p className="text-xs text-tx-muted truncate">
                          {studentsTurning18.length === 1
                            ? `${studentsTurning18[0].fullName} - confirm remaining hours`
                            : `${studentsTurning18.length} students - confirm remaining hours`}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-status-warning-bg border border-status-warning-border text-status-warning-text">
                        {studentsTurning18.length}
                      </span>
                    </button>
                  )}

                  {reviewQueueCount > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/review-queue')}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors text-left group"
                    >
                      <div className="p-1.5 bg-status-warning-bg border border-status-warning-border rounded-md flex-shrink-0">
                        <ClipboardCheck className="h-4 w-4 text-status-warning-text" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-tx-primary">Lessons Need Review</p>
                        <p className="text-xs text-tx-muted truncate">
                          {reviewQueueCount === 1
                            ? '1 past lesson needs a status'
                            : `${reviewQueueCount} past lessons need a status`}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-status-warning-bg border border-status-warning-border text-status-warning-text">
                        {reviewQueueCount}
                      </span>
                    </button>
                  )}

                  {noShowAlerts.length > 0 && (
                    <div className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors group">
                      <button
                        type="button"
                        onClick={() => navigate('/students', { state: { filter: 'no_show_followup' } })}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="p-1.5 bg-status-danger-bg border border-status-danger-border rounded-md flex-shrink-0">
                          <UserX className="h-4 w-4 text-status-danger-text" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-tx-primary">No-Show Follow-Up</p>
                          <p className="text-xs text-tx-muted truncate">
                            {noShowAlerts.length === 1
                              ? `${noShowAlerts[0].studentName} - missed a lesson`
                              : `${noShowAlerts.length} students missed a lesson`}
                          </p>
                        </div>
                      </button>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-status-danger-bg border border-status-danger-border text-status-danger-text">
                        {noShowAlerts.length}
                      </span>
                      {noShowAlerts.length === 1 && (
                        <button
                          type="button"
                          onClick={() => dismissAlertMutation.mutate(noShowAlerts[0].notificationId)}
                          disabled={dismissAlertMutation.isPending}
                          className="flex-shrink-0 p-1 text-tx-muted hover:text-tx-secondary rounded transition-colors disabled:opacity-50"
                          aria-label="Dismiss no-show alert"
                          title="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {pendingPayments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/payments')}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors text-left group"
                    >
                      <div className="p-1.5 bg-primary/10 rounded-md flex-shrink-0">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-tx-primary">Pending Payments</p>
                        <p className="text-xs text-tx-muted truncate">
                          ${pendingPayments.reduce((s, p) => s + (+p.amount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} awaiting
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {pendingPayments.length}
                      </span>
                    </button>
                  )}

                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {isStudentModalOpen && (
        <StudentModal
          student={null}
          onClose={() => setIsStudentModalOpen(false)}
          onBookLesson={handleBookLesson}
        />
      )}
      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} student={null} />

      {isSmartBookingOpen && (
        <ModalShell maxWidth="max-w-3xl">
          <SmartBookingForm
            preselectedStudent={studentForBooking || undefined}
            onBookingComplete={handleBookingComplete}
            onCancel={() => {
              setIsSmartBookingOpen(false);
              setStudentForBooking(null);
            }}
          />
        </ModalShell>
      )}
    </div>
  );
};
