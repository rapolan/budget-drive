import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, UserCheck, Calendar, CreditCard, Plus, DollarSign, AlertCircle, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { studentsApi, instructorsApi, paymentsApi, lessonsApi } from '@/api';
import { StudentModal } from '@/components/students/StudentModal';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { DashboardSkeleton } from '@/components/common/Skeleton';
import type { Student } from '@/types';
import { computeStudentStatus, studentNeedsFollowup as checkNeedsFollowup } from '@/utils/studentStatus';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Fetch real data for stats
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
  });

  const { data: instructorsData, isLoading: instructorsLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => paymentsApi.getAll(),
  });

  const { data: lessonsData, isLoading: lessonsLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonsApi.getAll(1, 1000),
  });

  const students = studentsData?.data || [];
  const instructors = instructorsData?.data || [];
  const payments = paymentsData?.data || [];
  const lessons = lessonsData?.data || [];

  // Show loading skeleton while any data is loading
  const isLoading = studentsLoading || instructorsLoading || paymentsLoading || lessonsLoading;

  // Calculate stats using computed status
  const activeInstructors = instructors.filter((i) => i.status === 'active').length;

  // Count active students using computed status
  const activeStudents = students.filter((s) => {
    const statusInfo = computeStudentStatus(s, lessons);
    return statusInfo.status === 'active';
  }).length;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Today's lessons
  const todaysLessons = lessons.filter((l) => {
    const lessonDate = new Date(l.date);
    const lessonDay = new Date(lessonDate.getFullYear(), lessonDate.getMonth(), lessonDate.getDate());
    return lessonDay.getTime() === today.getTime() && l.status === 'scheduled';
  });

  // Upcoming lessons (next 7 days)
  const next7Days = new Date(today);
  next7Days.setDate(today.getDate() + 7);
  const upcomingLessons = lessons.filter((l) => {
    const lessonDate = new Date(l.date);
    return lessonDate > now && lessonDate <= next7Days && l.status === 'scheduled';
  });

  // Students needing followup using utility function
  const studentsNeedingFollowup = students.filter((s) => checkNeedsFollowup(s, lessons)).length;

  // Calculate this month's revenue
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyPayments = payments.filter((p) => {
    const paymentDate = new Date(p.date);
    return paymentDate >= firstDayOfMonth && p.status === 'confirmed';
  });
  const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Outstanding balance
  const outstandingBalance = students.reduce((sum, s) => sum + (Number(s.outstandingBalance) || 0), 0);

  const stats = [
    {
      name: 'Total Students',
      value: students.length.toString(),
      icon: Users,
      color: 'bg-blue-500',
      change: `${activeStudents} active`,
      link: '/students',
      filter: null,
    },
    {
      name: 'Active Instructors',
      value: activeInstructors.toString(),
      icon: UserCheck,
      color: 'bg-green-500',
      change: `${instructors.length} total`,
      link: '/instructors',
      filter: null,
    },
    {
      name: "Today's Lessons",
      value: todaysLessons.length.toString(),
      icon: Calendar,
      color: 'bg-yellow-500',
      change: todaysLessons.length === 0 ? 'No lessons today' : 'Scheduled for today',
      link: '/lessons',
      filter: null,
    },
    {
      name: 'Upcoming (7 Days)',
      value: upcomingLessons.length.toString(),
      icon: Clock,
      color: 'bg-purple-500',
      change: 'Next week',
      link: '/lessons',
      filter: null,
    },
    {
      name: 'Need Followup',
      value: studentsNeedingFollowup.toString(),
      icon: AlertCircle,
      color: 'bg-orange-500',
      change: studentsNeedingFollowup === 0 ? 'All good!' : 'Students to contact',
      link: '/students',
      filter: 'needsFollowup',
    },
    {
      name: 'Revenue This Month',
      value: `$${monthlyRevenue.toFixed(0)}`,
      icon: CreditCard,
      color: 'bg-pink-500',
      change: `${monthlyPayments.length} payments`,
      link: '/payments',
      filter: null,
    },
  ];

  // Show loading skeleton while data is being fetched
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome to your driving school management system
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              onClick={() => {
                if (stat.filter) {
                  navigate(stat.link, { state: { filter: stat.filter } });
                } else {
                  navigate(stat.link);
                }
              }}
              className="overflow-hidden rounded-lg bg-white shadow cursor-pointer transition-all hover:shadow-lg hover:scale-105"
            >
              <div className="p-6">
                <div className="flex items-center">
                  <div className={`rounded-md p-3 ${stat.color}`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-4 flex-1">
                    <p className="text-sm font-medium text-gray-500">
                      {stat.name}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900">
                      {stat.value}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <span className="text-sm font-medium text-green-600">
                    {stat.change}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    vs last month
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg bg-white p-4 sm:p-6 shadow">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">Quick Actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setIsStudentModalOpen(true)}
            className="group flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-primary hover:bg-blue-50 hover:shadow-sm"
          >
            <div className="rounded-md bg-blue-100 p-2 text-blue-600 group-hover:bg-blue-200">
              <Plus className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">Add New Student</p>
              <p className="mt-0.5 text-sm text-gray-500">Register a new student</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate('/lessons', { state: { openSmartBooking: true } })}
            className="group flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-primary hover:bg-yellow-50 hover:shadow-sm"
          >
            <div className="rounded-md bg-yellow-100 p-2 text-yellow-600 group-hover:bg-yellow-200">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">Schedule Lesson</p>
              <p className="mt-0.5 text-sm text-gray-500">Smart booking with availability</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(true)}
            className="group flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-primary hover:bg-green-50 hover:shadow-sm"
          >
            <div className="rounded-md bg-green-100 p-2 text-green-600 group-hover:bg-green-200">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">Process Payment</p>
              <p className="mt-0.5 text-sm text-gray-500">Record a new payment</p>
            </div>
          </button>
          <button
            type="button"
            disabled
            className="group flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-left opacity-60"
          >
            <div className="rounded-md bg-purple-100 p-2 text-purple-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">View Reports</p>
              <p className="mt-0.5 text-sm text-gray-500">Coming soon</p>
            </div>
          </button>
        </div>
      </div>

      {/* Today's Schedule */}
      {todaysLessons.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Today's Schedule</h2>
          <div className="mt-4 space-y-3">
            {todaysLessons
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((lesson) => {
                const student = students.find(s => s.id === lesson.studentId);
                const instructor = instructors.find(i => i.id === lesson.instructorId);
                return (
                  <div key={lesson.id} className="flex items-center justify-between border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-gray-900">
                          {lesson.startTime.slice(0, 5)} - {lesson.endTime.slice(0, 5)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {student?.fullName || 'Unknown Student'} with {instructor?.fullName || 'Unknown Instructor'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 capitalize">
                        {lesson.lessonType.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                        Scheduled
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <div className="mt-4 space-y-3">
          {(() => {
            // Get last 5 completed lessons
            const recentCompletedLessons = lessons
              .filter(l => l.status === 'completed')
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 3);

            // Get recent enrollments (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const recentEnrollments = students
              .filter(s => new Date(s.enrollmentDate) >= thirtyDaysAgo)
              .sort((a, b) => new Date(b.enrollmentDate).getTime() - new Date(a.enrollmentDate).getTime())
              .slice(0, 2);

            // Get recent cancellations (last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const recentCancellations = lessons
              .filter(l => l.status === 'cancelled' && new Date(l.date) >= sevenDaysAgo)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 2);

            const activities = [
              ...recentCompletedLessons.map(lesson => ({
                type: 'completed_lesson',
                date: new Date(lesson.date),
                icon: CheckCircle,
                color: 'text-green-600',
                bgColor: 'bg-green-50',
                title: 'Lesson Completed',
                description: `${students.find(s => s.id === lesson.studentId)?.fullName || 'Student'} completed ${lesson.lessonType.replace(/_/g, ' ')}`,
              })),
              ...recentEnrollments.map(student => ({
                type: 'enrollment',
                date: new Date(student.enrollmentDate),
                icon: Users,
                color: 'text-blue-600',
                bgColor: 'bg-blue-50',
                title: 'New Enrollment',
                description: `${student.fullName} enrolled`,
              })),
              ...recentCancellations.map(lesson => ({
                type: 'cancellation',
                date: new Date(lesson.date),
                icon: AlertCircle,
                color: 'text-red-600',
                bgColor: 'bg-red-50',
                title: 'Lesson Cancelled',
                description: `${students.find(s => s.id === lesson.studentId)?.fullName || 'Student'}'s lesson cancelled`,
              })),
            ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);

            if (activities.length === 0) {
              return <p className="text-sm text-gray-500">No recent activity to display</p>;
            }

            return activities.map((activity, index) => {
              const Icon = activity.icon;
              return (
                <div key={index} className={`flex items-start gap-3 p-3 rounded-lg ${activity.bgColor}`}>
                  <Icon className={`h-5 w-5 ${activity.color} mt-0.5`} />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{activity.title}</p>
                    <p className="text-sm text-gray-600">{activity.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {activity.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              );
            });
          })()}
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
