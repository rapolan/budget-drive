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
import { computeStudentStatus, studentNeedsFollowup } from '@/utils/studentStatus';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
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
  
  // Active students count
  const activeStudents = useMemo(() => {
    return students.filter(s => {
      const statusInfo = computeStudentStatus(s, lessons);
      return statusInfo.status === 'active' || statusInfo.status === 'enrolled';
    });
  }, [students, lessons]);

  // Students needing follow-up
  const studentsNeedingFollowup = useMemo(() => {
    return students.filter(s => studentNeedsFollowup(s, lessons));
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
      .reduce((sum, p) => sum + (p.amount || 0), 0);
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Date Section */}
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900">{formatDate(now)}</h1>
              <p className="mt-2 lg:mt-3 text-base lg:text-xl text-gray-600">
                {todaysLessons.length === 0
                  ? 'No lessons scheduled today'
                  : `${todaysLessons.length} lesson${todaysLessons.length > 1 ? 's' : ''} scheduled today`
                }
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-3 lg:gap-4">
              <button
                type="button"
                onClick={() => setIsStudentModalOpen(true)}
                className="flex items-center gap-3 px-5 lg:px-6 py-2.5 lg:py-3 bg-white border-2 border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-400 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all shadow-sm text-sm lg:text-base font-medium"
              >
                <Plus className="h-5 w-5 flex-shrink-0" />
                <span>Student</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/lessons', { state: { openSmartBooking: true } })}
                className="flex items-center gap-3 px-5 lg:px-6 py-2.5 lg:py-3 bg-blue-600 rounded-xl text-white hover:bg-blue-700 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all shadow-sm text-sm lg:text-base font-medium"
              >
                <CalendarIcon className="h-5 w-5 flex-shrink-0" />
                <span>Schedule Lesson</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className="flex items-center gap-3 px-5 lg:px-6 py-2.5 lg:py-3 bg-white border-2 border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-400 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all shadow-sm text-sm lg:text-base font-medium"
              >
                <DollarSign className="h-5 w-5 flex-shrink-0" />
                <span>Payment</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6 lg:space-y-8">
        
        {/* Stats Cards Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {/* Active Students */}
          <button
            type="button"
            onClick={() => navigate('/students')}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6 hover:shadow-md hover:border-blue-300 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-gray-900">{activeStudents.length}</p>
            <p className="text-sm text-gray-500 mt-1">Active Students</p>
          </button>

          {/* This Week's Lessons */}
          <button
            type="button"
            onClick={() => navigate('/lessons', { state: { scrollToTable: true } })}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6 hover:shadow-md hover:border-green-300 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                <CalendarIcon className="h-5 w-5 text-green-600" />
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-green-500 transition-colors" />
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-gray-900">{weekLessonsCount}</p>
            <p className="text-sm text-gray-500 mt-1">Lessons This Week</p>
          </button>

          {/* Monthly Revenue */}
          <button
            type="button"
            onClick={() => navigate('/payments')}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6 hover:shadow-md hover:border-purple-300 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-purple-500 transition-colors" />
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-gray-900">${monthlyRevenue.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">Revenue This Month</p>
          </button>

          {/* Instructors */}
          <button
            type="button"
            onClick={() => navigate('/instructors')}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6 hover:shadow-md hover:border-orange-300 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors">
                <User className="h-5 w-5 text-orange-600" />
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-orange-500 transition-colors" />
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-gray-900">{instructors.filter(i => i.status === 'active').length}</p>
            <p className="text-sm text-gray-500 mt-1">Active Instructors</p>
          </button>
        </div>

        {/* Alerts Section */}
        {(studentsNeedingFollowup.length > 0 || expiringPermits.length > 0 || pendingPayments.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            {/* Follow-up Needed */}
            {studentsNeedingFollowup.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/students', { state: { filter: 'needsFollowup' } })}
                className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border-2 border-amber-200 p-5 hover:border-amber-400 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Phone className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-amber-900">Follow-up Needed</p>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-bold rounded-full">
                        {studentsNeedingFollowup.length}
                      </span>
                    </div>
                    <p className="text-sm text-amber-700 mt-1">
                      {studentsNeedingFollowup.length === 1 
                        ? `${studentsNeedingFollowup[0].fullName} needs contact`
                        : `${studentsNeedingFollowup.length} students haven't been contacted recently`
                      }
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* Expiring Permits */}
            {expiringPermits.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/students')}
                className="bg-gradient-to-r from-red-50 to-rose-50 rounded-xl border-2 border-red-200 p-5 hover:border-red-400 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-red-900">Permits Expiring</p>
                      <span className="px-2 py-0.5 bg-red-200 text-red-800 text-xs font-bold rounded-full">
                        {expiringPermits.length}
                      </span>
                    </div>
                    <p className="text-sm text-red-700 mt-1">
                      {expiringPermits.length === 1
                        ? `${expiringPermits[0].fullName}'s permit expires soon`
                        : `${expiringPermits.length} permits expire within 30 days`
                      }
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* Pending Payments */}
            {pendingPayments.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/payments')}
                className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-5 hover:border-blue-400 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-blue-900">Pending Payments</p>
                      <span className="px-2 py-0.5 bg-blue-200 text-blue-800 text-xs font-bold rounded-full">
                        {pendingPayments.length}
                      </span>
                    </div>
                    <p className="text-sm text-blue-700 mt-1">
                      ${pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()} awaiting confirmation
                    </p>
                  </div>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Schedule Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Side - Today's Timeline */}
          <div className="xl:col-span-5">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
              <div className="px-6 lg:px-8 py-5 lg:py-6 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xl lg:text-2xl font-semibold text-gray-900">Today's Schedule</h2>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                {todaysLessons.length === 0 ? (
                  <div className="text-center py-12 lg:py-16 px-6">
                    <CalendarIcon className="h-16 w-16 lg:h-20 lg:w-20 text-gray-300 mx-auto mb-4 lg:mb-6" />
                    <p className="text-gray-500 text-lg lg:text-xl font-medium">No lessons scheduled</p>
                    <p className="text-gray-400 text-sm lg:text-base mt-2 lg:mt-3">Enjoy your day off!</p>
                    <button
                      type="button"
                      onClick={() => navigate('/lessons', { state: { openSmartBooking: true } })}
                      className="mt-4 lg:mt-6 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <Plus className="h-4 w-4" />
                      Schedule a Lesson
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Summary Stats */}
                    <div className="px-6 lg:px-8 pt-4 lg:pt-6 pb-3 lg:pb-4">
                      <div className="grid grid-cols-2 gap-3 lg:gap-4 mb-3 lg:mb-4">
                        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 lg:p-4">
                          <p className="text-xs lg:text-sm text-green-600 font-medium mb-1">Completed</p>
                          <p className="text-2xl lg:text-3xl font-bold text-green-700">{completedLessons.length}</p>
                        </div>
                        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 lg:p-4">
                          <p className="text-xs lg:text-sm text-blue-600 font-medium mb-1">Remaining</p>
                          <p className="text-2xl lg:text-3xl font-bold text-blue-700">{upcomingLessons.length}</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="bg-gray-200 rounded-full h-2 lg:h-3 overflow-hidden">
                        <div
                          className="bg-green-500 h-full transition-all duration-500"
                          style={{ width: `${(completedLessons.length / todaysLessons.length) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Current/Next Lesson Highlights */}
                    {(currentLesson || nextLesson) && (
                      <div className="px-6 lg:px-8 pb-3 lg:pb-4 space-y-3">
                        {currentLesson && (
                          <div className="bg-blue-500 text-white rounded-xl p-4 lg:p-5 shadow-lg">
                            <div className="flex items-center justify-between mb-2 lg:mb-3">
                              <span className="text-xs lg:text-sm font-bold uppercase tracking-wider">Now</span>
                              <Clock className="h-4 w-4 lg:h-5 lg:w-5" />
                            </div>
                            <p className="text-lg lg:text-xl font-bold mb-1">
                              {students.find(s => s.id === currentLesson.studentId)?.fullName || 'Unknown Student'}
                            </p>
                            <p className="text-blue-100 text-xs lg:text-sm">
                              {format12Hour(currentLesson.startTime)} - {format12Hour(currentLesson.endTime)} • {instructors.find(i => i.id === currentLesson.instructorId)?.fullName || 'Unknown Instructor'}
                            </p>
                          </div>
                        )}

                        {nextLesson && !currentLesson && (
                          <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 lg:p-5">
                            <div className="flex items-center justify-between mb-2 lg:mb-3">
                              <span className="text-xs lg:text-sm font-bold text-blue-600 uppercase tracking-wider">Next</span>
                              <Clock className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                            </div>
                            <p className="text-lg lg:text-xl font-bold text-gray-900 mb-1">
                              {students.find(s => s.id === nextLesson.studentId)?.fullName || 'Unknown Student'}
                            </p>
                            <p className="text-blue-700 text-xs lg:text-sm">
                              {format12Hour(nextLesson.startTime)} - {format12Hour(nextLesson.endTime)} • {instructors.find(i => i.id === nextLesson.instructorId)?.fullName || 'Unknown Instructor'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* All Completed Celebration */}
                    {completedLessons.length === todaysLessons.length && todaysLessons.length > 0 && (
                      <div className="px-6 lg:px-8 pb-4 lg:pb-6">
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-5 lg:p-6 text-center">
                          <div className="text-4xl lg:text-5xl mb-3">🎉</div>
                          <h3 className="text-lg lg:text-xl font-bold text-green-800 mb-2">All Done for Today!</h3>
                          <p className="text-sm text-green-600 mb-4">
                            {completedLessons.length} lesson{completedLessons.length > 1 ? 's' : ''} completed
                          </p>
                          
                          {/* Compact list of completed lessons */}
                          <div className="bg-white/60 rounded-lg p-3 lg:p-4">
                            <div className="space-y-2">
                              {completedLessons.map((lesson) => {
                                const student = students.find(s => s.id === lesson.studentId);
                                const instructor = instructors.find(i => i.id === lesson.instructorId);
                                return (
                                  <div
                                    key={lesson.id}
                                    className="flex items-center justify-between text-sm py-1.5 border-b border-green-100 last:border-0"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-green-500">✓</span>
                                      <span className="font-medium text-gray-800">{student?.fullName || 'Student'}</span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {format12Hour(lesson.startTime)} • {instructor?.fullName?.split(' ')[0] || 'Instructor'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Scrollable Lesson List - Only show when there are upcoming lessons */}
                    {upcomingLessons.length > 0 && (
                      <div className="flex-1 overflow-y-auto px-6 lg:px-8 pb-6 lg:pb-8">
                        <div className="space-y-2 lg:space-y-3">
                          {todaysLessons.map((lesson) => {
                            const student = students.find(s => s.id === lesson.studentId);
                            const instructor = instructors.find(i => i.id === lesson.instructorId);
                            const isPast = lesson.endTime <= currentTime;
                            const isNow = lesson.startTime <= currentTime && lesson.endTime > currentTime;

                            return (
                              <div
                                key={lesson.id}
                                onClick={() => navigate('/lessons')}
                                className={`rounded-lg border-2 p-4 transition-all cursor-pointer ${
                                  isNow
                                    ? 'border-blue-500 bg-blue-50 shadow-md'
                                    : isPast
                                    ? 'border-gray-200 opacity-50'
                                    : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className={`h-4 w-4 flex-shrink-0 ${isNow ? 'text-blue-600' : isPast ? 'text-gray-400' : 'text-gray-500'}`} />
                                    <span className={`font-semibold text-sm ${isNow ? 'text-blue-900' : 'text-gray-900'}`}>
                                      {format12Hour(lesson.startTime)} - {format12Hour(lesson.endTime)}
                                    </span>
                                  </div>
                                  {isNow && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500 text-white font-semibold">
                                      Now
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mb-1">
                                  <User className={`h-4 w-4 flex-shrink-0 ${isNow ? 'text-blue-600' : 'text-gray-400'}`} />
                                  <span className={`font-medium text-sm ${isNow ? 'text-blue-900' : 'text-gray-900'}`}>
                                    {student?.fullName || 'Unknown Student'}
                                  </span>
                                </div>
                                <p className={`text-xs ${isNow ? 'text-blue-700' : 'text-gray-500'} ml-6`}>
                                  {instructor?.fullName || 'Unknown Instructor'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Side - Weekly Calendar */}
          <div className="xl:col-span-7">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-full">
              <div className="px-6 lg:px-8 py-5 lg:py-6 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl lg:text-2xl font-semibold text-gray-900">Next 7 Days</h2>
                  <button
                    type="button"
                    onClick={() => navigate('/lessons')}
                    className="text-sm lg:text-base text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    View All →
                  </button>
                </div>
              </div>

              <div className="p-4 lg:p-8">
                {/* Mobile: Show 4 days, Desktop: Show 7 */}
                <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 lg:gap-4">
                  {weeklyLessons.slice(0, 7).map((day, index) => (
                    <div
                      key={index}
                      onClick={() => navigate('/lessons')}
                      className={`text-center p-3 lg:p-5 rounded-xl border-2 transition-all cursor-pointer min-h-[120px] lg:min-h-[200px] flex flex-col ${
                        index >= 4 ? 'hidden lg:flex' : ''
                      } ${
                        day.isToday
                          ? 'border-blue-500 bg-blue-50 shadow-lg'
                          : day.count > 0
                          ? 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-lg'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`text-xs font-bold uppercase tracking-wider mb-1 lg:mb-3 ${
                        day.isToday ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        {formatDayShort(day.date)}
                      </div>
                      <div className={`text-xl lg:text-3xl font-bold mb-2 lg:mb-4 ${
                        day.isToday ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {formatDayDate(day.date)}
                      </div>

                      {day.count > 0 ? (
                        <div className="space-y-1 lg:space-y-3 flex-1 flex flex-col">
                          <div className={`inline-flex items-center justify-center w-8 h-8 lg:w-12 lg:h-12 mx-auto rounded-full ${
                            day.isToday
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-700'
                          } font-bold text-sm lg:text-xl`}>
                            {day.count}
                          </div>
                          <p className={`text-xs lg:text-sm font-medium ${
                            day.isToday ? 'text-blue-700' : 'text-gray-600'
                          }`}>
                            {day.count === 1 ? 'lesson' : 'lessons'}
                          </p>

                          {/* Show instructors - desktop only */}
                          <div className="mt-auto pt-2 lg:pt-3 space-y-1 hidden lg:block">
                            {day.lessons.slice(0, 2).map((lesson, idx) => {
                              const instructor = instructors.find(i => i.id === lesson.instructorId);
                              return (
                                <div
                                  key={idx}
                                  className={`text-xs truncate font-medium ${
                                    day.isToday ? 'text-blue-600' : 'text-gray-500'
                                  }`}
                                >
                                  {instructor?.fullName?.split(' ')[0] || 'Instructor'}
                                </div>
                              );
                            })}
                            {day.lessons.length > 2 && (
                              <div className={`text-xs font-medium ${
                                day.isToday ? 'text-blue-500' : 'text-gray-400'
                              }`}>
                                +{day.lessons.length - 2} more
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <div>
                            <div className="w-2 h-2 lg:w-3 lg:h-3 bg-gray-300 rounded-full mx-auto mb-1 lg:mb-2"></div>
                            <p className="text-xs text-gray-400 font-medium hidden lg:block">Free</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Mobile: Show "more days" hint */}
                <p className="text-center text-xs text-gray-400 mt-3 lg:hidden">
                  + {weeklyLessons.slice(4).filter(d => d.count > 0).length} more days with lessons
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {isStudentModalOpen && (
        <StudentModal
          student={null}
          onClose={() => setIsStudentModalOpen(false)}
        />
      )}

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        student={null}
      />
    </div>
  );
};
