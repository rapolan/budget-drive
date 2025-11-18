import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, UserCheck, Car, Calendar, CreditCard, TrendingUp, Plus, DollarSign } from 'lucide-react';
import { studentsApi, instructorsApi, vehiclesApi, paymentsApi, lessonsApi } from '@/api';
import { StudentModal } from '@/components/students/StudentModal';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { LessonModal } from '@/components/lessons/LessonModal';

export const DashboardPage: React.FC = () => {
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);

  // Fetch real data for stats
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

  const { data: paymentsData } = useQuery({
    queryKey: ['payments'],
    queryFn: () => paymentsApi.getAll(),
  });

  const { data: lessonsData } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonsApi.getAll(1, 1000),
  });

  const students = studentsData?.data || [];
  const instructors = instructorsData?.data || [];
  const vehicles = vehiclesData?.data || [];
  const payments = paymentsData?.data || [];
  const lessons = lessonsData?.data || [];

  // Calculate stats
  const activeInstructors = instructors.filter((i) => i.status === 'active').length;
  const activeStudents = students.filter((s) => s.status === 'active').length;

  // Calculate this month's revenue
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyPayments = payments.filter((p) => {
    const paymentDate = new Date(p.date);
    return paymentDate >= firstDayOfMonth && p.status === 'confirmed';
  });
  const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Calculate this week's lessons
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
  endOfWeek.setHours(23, 59, 59, 999);

  const weeklyLessons = lessons.filter((l) => {
    const lessonDate = new Date(l.date);
    return lessonDate >= startOfWeek && lessonDate <= endOfWeek && l.status === 'scheduled';
  });

  const stats = [
    {
      name: 'Total Students',
      value: students.length.toString(),
      icon: Users,
      color: 'bg-blue-500',
      change: `${activeStudents} active`,
    },
    {
      name: 'Active Instructors',
      value: activeInstructors.toString(),
      icon: UserCheck,
      color: 'bg-green-500',
      change: `${instructors.length} total`,
    },
    {
      name: 'Vehicles',
      value: vehicles.length.toString(),
      icon: Car,
      color: 'bg-purple-500',
      change: 'Fleet status',
    },
    {
      name: 'Lessons This Week',
      value: weeklyLessons.length.toString(),
      icon: Calendar,
      color: 'bg-yellow-500',
      change: `${lessons.filter((l) => l.status === 'scheduled').length} total scheduled`,
    },
    {
      name: 'Revenue This Month',
      value: `$${monthlyRevenue.toFixed(0)}`,
      icon: CreditCard,
      color: 'bg-pink-500',
      change: `${monthlyPayments.length} payments`,
    },
    {
      name: 'Total Payments',
      value: payments.length.toString(),
      icon: TrendingUp,
      color: 'bg-indigo-500',
      change: 'All time',
    },
  ];

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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              className="overflow-hidden rounded-lg bg-white shadow"
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
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
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
            onClick={() => setIsLessonModalOpen(true)}
            className="group flex items-start gap-3 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-primary hover:bg-yellow-50 hover:shadow-sm"
          >
            <div className="rounded-md bg-yellow-100 p-2 text-yellow-600 group-hover:bg-yellow-200">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">Schedule Lesson</p>
              <p className="mt-0.5 text-sm text-gray-500">Book a driving lesson</p>
            </div>
          </button>
          <button
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

      {/* Recent Activity */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <div className="mt-4">
          <p className="text-sm text-gray-500">No recent activity to display</p>
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

      {isLessonModalOpen && (
        <LessonModal
          lesson={null}
          onClose={() => setIsLessonModalOpen(false)}
        />
      )}
    </div>
  );
};
