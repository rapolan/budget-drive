import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  ChevronRight
} from 'lucide-react';
import { studentsApi, instructorsApi, lessonsApi, paymentsApi } from '@/api';
import { StudentModal } from '@/components/students/StudentModal';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { DashboardSkeleton } from '@/components/common/Skeleton';
import { format12Hour } from '@/utils/timeFormat';
import { computeStudentStatus } from '@/utils/studentStatus';
import { useAuth } from '@/contexts/AuthContext';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isInstructor = user?.role === 'instructor';

  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

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

  const students = studentsData?.data || [];
  const instructors = instructorsData?.data || [];
  const lessons = lessonsData?.data || [];
  const payments = paymentsData?.data || [];

  const isLoading = studentsLoading || instructorsLoading || lessonsLoading;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentTime = now.toTimeString().slice(0, 5);

  // ============================================
  // DASHBOARD STATS
  // ============================================
  
  // Active students count (scheduled + ready to book = students in the pipeline)
  const activeStudents = useMemo(() => {
    return students.filter(s => {
      const statusInfo = computeStudentStatus(s, lessons);
      return statusInfo.status === 'scheduled' || statusInfo.status === 'ready_to_book';
    });
  }, [students, lessons]);

  // Students needing attention
  const studentsNeedingAttention = useMemo(() => {
    return students.filter(s => computeStudentStatus(s, lessons).status === 'needs_attention');
  }, [students, lessons]);

  // Permits expiring within 30 days
  const expiringPermits = useMemo(() => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    return students.filter(s => {
      if (!s.learnerPermitExpiration) return false;
      const expDate = new Date(s.learnerPermitExpiration);
      return expDate <= thirtyDaysFromNow && expDate >= today;
    });
  }, [students, today]);

  // This month's revenue
  const monthlyRevenue = useMemo(() => {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return payments
      .filter(p => {
        const paymentDate = new Date(p.date);
        return paymentDate >= startOfMonth && p.status === 'confirmed';
      })
      .reduce((sum, p) => sum + (+p.amount || 0), 0);
  }, [payments, now]);

  // Pending payments
  const pendingPayments = useMemo(() => {
    return payments.filter(p => p.status === 'pending');
  }, [payments]);

  // This week's lessons count
  const weekLessonsCount = useMemo(() => {
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 7);
    
    return lessons.filter(l => {
      const lessonDate = new Date(l.date);
      return lessonDate >= today && lessonDate < endOfWeek && l.status === 'scheduled';
    }).length;
  }, [lessons, today]);

  // Today's lessons
  const todaysLessons = useMemo(() => {
    return lessons
      .filter((l) => {
        const lessonDate = new Date(l.date);
        const lessonDay = new Date(lessonDate.getFullYear(), lessonDate.getMonth(), lessonDate.getDate());
        return lessonDay.getTime() === today.getTime() && l.status === 'scheduled';
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [lessons, today]);

  // Current and next lesson
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

  // Get next 7 days of lessons
  const weeklyLessons = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const dayLessons = lessons.filter((l) => {
        const lessonDate = new Date(l.date);
        const lessonDay = new Date(lessonDate.getFullYear(), lessonDate.getMonth(), lessonDate.getDate());
        return lessonDay.getTime() === date.getTime() && l.status === 'scheduled';
      });

      days.push({
        date,
        lessons: dayLessons,
        count: dayLessons.length,
        isToday: i === 0,
      });
    }
    return days;
  }, [lessons, today]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

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
            <h1 className="text-2xl font-bold text-tx-primary">{formatDate(now)}</h1>
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
              className="flex items-center gap-2 px-4 py-2 bg-surface border border-[var(--border)] rounded-lg text-tx-secondary hover:bg-surface2 transition-colors text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Student
            </button>
            <button
              type="button"
              onClick={() => navigate('/lessons', { state: { openSmartBooking: true } })}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:brightness-90 transition-all text-sm font-medium"
            >
              <CalendarIcon className="h-4 w-4" />
              Schedule Lesson
            </button>
            {!isInstructor && (
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-[var(--border)] rounded-lg text-tx-secondary hover:bg-surface2 transition-colors text-sm font-medium"
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
            <div className="bg-surface rounded-xl border border-[var(--border)] overflow-hidden flex flex-col h-full">
              <div className="px-5 py-4 border-b border-[var(--border)] bg-surface2 flex items-center justify-between">
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
                    onClick={() => navigate('/lessons', { state: { openSmartBooking: true } })}
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
                        <span className="text-xs font-medium text-green-600">
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
                        className="bg-green-500 h-full transition-all duration-500"
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
                    <div className="mx-5 mb-3 bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                      <p className="text-2xl mb-1">🎉</p>
                      <p className="font-semibold text-green-600">All done for today!</p>
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
                                ? 'border-[var(--border)] opacity-40'
                                : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-surface2'
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
            <div className="bg-surface rounded-xl border border-[var(--border)] overflow-hidden">
              <button
                type="button"
                onClick={() => navigate('/students')}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface2 transition-colors border-b border-[var(--border)] group"
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
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface2 transition-colors border-b border-[var(--border)] group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-green-500/10 rounded-md">
                    <CalendarIcon className="h-4 w-4 text-green-600" />
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
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface2 transition-colors border-b border-[var(--border)] group"
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
                    <div className="p-1.5 bg-orange-500/10 rounded-md">
                      <User className="h-4 w-4 text-orange-600" />
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
            <div className="bg-surface rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)] bg-surface2 flex items-center justify-between">
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
                          ? 'border-[var(--border)] hover:border-primary/30 hover:bg-primary/5'
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
            {(studentsNeedingAttention.length > 0 || expiringPermits.length > 0 || pendingPayments.length > 0) && (
              <div className="bg-surface rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border)] bg-surface2">
                  <h2 className="text-sm font-semibold text-tx-primary">Alerts</h2>
                </div>
                <div className="divide-y divide-[var(--border)]">

                  {studentsNeedingAttention.length > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/students', { state: { filter: 'needs_attention' } })}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface2 transition-colors text-left group"
                    >
                      <div className="p-1.5 bg-amber-500/10 rounded-md flex-shrink-0">
                        <Phone className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-tx-primary">Needs Attention</p>
                        <p className="text-xs text-tx-muted truncate">
                          {studentsNeedingAttention.length === 1
                            ? `${studentsNeedingAttention[0].fullName}`
                            : `${studentsNeedingAttention.length} students`}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
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
                      <div className="p-1.5 bg-red-500/10 rounded-md flex-shrink-0">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-tx-primary">Permits Expiring</p>
                        <p className="text-xs text-tx-muted truncate">
                          {expiringPermits.length === 1
                            ? `${expiringPermits[0].fullName}`
                            : `${expiringPermits.length} within 30 days`}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600">
                        {expiringPermits.length}
                      </span>
                    </button>
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
        <StudentModal student={null} onClose={() => setIsStudentModalOpen(false)} />
      )}
      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} student={null} />
    </div>
  );
};
