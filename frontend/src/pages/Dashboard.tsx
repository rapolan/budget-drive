import React from 'react';
import { Users, UserCheck, Car, Calendar, CreditCard, TrendingUp } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  // TODO: Fetch real data from API
  const stats = [
    {
      name: 'Total Students',
      value: '0',
      icon: Users,
      color: 'bg-blue-500',
      change: '+0%',
    },
    {
      name: 'Active Instructors',
      value: '0',
      icon: UserCheck,
      color: 'bg-green-500',
      change: '+0%',
    },
    {
      name: 'Vehicles',
      value: '0',
      icon: Car,
      color: 'bg-purple-500',
      change: '+0%',
    },
    {
      name: 'Lessons This Week',
      value: '0',
      icon: Calendar,
      color: 'bg-yellow-500',
      change: '+0%',
    },
    {
      name: 'Revenue This Month',
      value: '$0',
      icon: CreditCard,
      color: 'bg-pink-500',
      change: '+0%',
    },
    {
      name: 'Growth Rate',
      value: '0%',
      icon: TrendingUp,
      color: 'bg-indigo-500',
      change: '+0%',
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
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button className="rounded-md border border-gray-300 px-4 py-3 text-left hover:bg-gray-50">
            <p className="font-medium text-gray-900">Add New Student</p>
            <p className="mt-1 text-sm text-gray-500">Register a new student</p>
          </button>
          <button className="rounded-md border border-gray-300 px-4 py-3 text-left hover:bg-gray-50">
            <p className="font-medium text-gray-900">Schedule Lesson</p>
            <p className="mt-1 text-sm text-gray-500">Book a driving lesson</p>
          </button>
          <button className="rounded-md border border-gray-300 px-4 py-3 text-left hover:bg-gray-50">
            <p className="font-medium text-gray-900">Process Payment</p>
            <p className="mt-1 text-sm text-gray-500">Record a new payment</p>
          </button>
          <button className="rounded-md border border-gray-300 px-4 py-3 text-left hover:bg-gray-50">
            <p className="font-medium text-gray-900">View Reports</p>
            <p className="mt-1 text-sm text-gray-500">Check analytics</p>
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
    </div>
  );
};
