import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, CreditCard, TrendingUp, Search, Plus, Check, X, LayoutGrid, LayoutList, Mail, Phone, History } from 'lucide-react';
import { studentsApi } from '@/api';
import { PaymentModal, PaymentHistoryModal } from '@/components/payments';
import type { Student } from '@/types';
import { EmptyState, LoadingSpinner, BackButton } from '@/components/common';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

type ViewMode = 'table' | 'cards';

export const PaymentsPage: React.FC = () => {
  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Fetch students
  const { data: studentsData, isLoading, error } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
  });

  const students = studentsData?.data || [];

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
            <h1 className="text-2xl font-bold text-gray-900">Payments & Balances</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track student payments and account balances
            </p>
          </div>

          {/* Auth Notice */}
          <div className="rounded-lg border-l-4 border-yellow-500 bg-yellow-50 p-6">
            <h3 className="mb-2 font-semibold text-yellow-900">Authentication Required</h3>
            <div className="space-y-2 text-sm text-yellow-800">
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
          <div className="rounded-lg bg-gray-100 p-8 text-center">
            <DollarSign className="mx-auto h-16 w-16 text-gray-400" />
            <p className="mt-4 text-sm text-gray-600">
              Payment tracking interface will appear here once authenticated
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Error loading students data. Please try again.
      </div>
    );
  }

  // Calculate payment info from student data
  const getPaymentInfo = (student: typeof students[0]) => {
    if (!student) {
      return {
        totalDue: 0,
        paid: 0,
        balance: 0,
        status: 'unpaid' as const,
      };
    }

    const totalPaid = Number(student.totalPaid) || 0;
    const outstandingBalance = Number(student.outstandingBalance) || 0;
    const totalDue = totalPaid + outstandingBalance;

    let status: 'paid' | 'partial' | 'unpaid' | 'overdue' = 'unpaid';
    if (outstandingBalance === 0 && totalPaid > 0) {
      status = 'paid';
    } else if (totalPaid > 0 && outstandingBalance > 0) {
      status = 'partial';
    } else if (student.paymentStatus === 'overdue') {
      status = 'overdue';
    }

    return {
      totalDue,
      paid: totalPaid,
      balance: outstandingBalance,
      status,
    };
  };

  // Filter students
  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'all') return true;

    const payment = getPaymentInfo(student);
    return payment.status === filterStatus;
  });

  // Calculate totals
  const totals = students.reduce(
    (acc, student) => {
      const payment = getPaymentInfo(student);
      return {
        totalDue: acc.totalDue + payment.totalDue,
        totalPaid: acc.totalPaid + payment.paid,
        totalOutstanding: acc.totalOutstanding + payment.balance,
      };
    },
    { totalDue: 0, totalPaid: 0, totalOutstanding: 0 }
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'unpaid':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">Payments & Balances</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track student payments and account balances
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedStudent(null);
              setIsPaymentModalOpen(true);
            }}
            className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
          >
            <Plus className="mr-2 h-5 w-5 flex-shrink-0" />
            Record Payment
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total Revenue */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                ${totals.totalDue.toFixed(2)}
              </p>
            </div>
            <TrendingUp className="h-12 w-12 text-blue-500" />
          </div>
        </div>

        {/* Total Collected */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Collected</p>
              <p className="mt-2 text-3xl font-bold text-green-600">
                ${totals.totalPaid.toFixed(2)}
              </p>
            </div>
            <DollarSign className="h-12 w-12 text-green-500" />
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Outstanding</p>
              <p className="mt-2 text-3xl font-bold text-red-600">
                ${totals.totalOutstanding.toFixed(2)}
              </p>
            </div>
            <CreditCard className="h-12 w-12 text-red-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Search */}
          <div className="flex items-center rounded-md border border-gray-300 bg-white px-4 py-2">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by student name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="nope"
              className="ml-2 flex-1 border-none bg-transparent outline-none"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            title="Filter by payment status"
            aria-label="Filter by payment status"
            className="rounded-md border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none"
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
                  className={`bg-white rounded-xl shadow-sm border-2 p-5 hover:shadow-md transition-all ${
                    payment.status === 'paid' ? 'border-green-200' :
                    payment.status === 'unpaid' ? 'border-red-200' :
                    'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {/* Header - Student Name & Status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{student.fullName}</h3>
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
                      <span className="text-gray-600">Payment Progress</span>
                      <span className="font-medium text-gray-900">
                        {Math.round(progressPercent)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progressPercent >= 100 ? 'bg-green-500' : progressPercent >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, progressPercent)}%` }}
                      />
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-xs text-gray-500">Total Due</div>
                      <div className="text-sm font-semibold text-gray-900">${payment.totalDue.toFixed(2)}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2">
                      <div className="text-xs text-gray-500">Paid</div>
                      <div className="text-sm font-semibold text-green-600">${payment.paid.toFixed(2)}</div>
                    </div>
                    <div className={`rounded-lg p-2 ${payment.balance > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                      <div className="text-xs text-gray-500">Balance</div>
                      <div className={`text-sm font-semibold ${payment.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ${payment.balance.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-1 mb-4 text-sm">
                    <a href={`mailto:${student.email}`} className="flex items-center gap-2 text-gray-600 hover:text-blue-600 truncate">
                      <Mail className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{student.email}</span>
                    </a>
                    {student.phone && (
                      <a href={`tel:${student.phone}`} className="flex items-center gap-2 text-gray-600 hover:text-blue-600">
                        <Phone className="h-4 w-4 flex-shrink-0" />
                        {student.phone}
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudent(student);
                        setIsPaymentModalOpen(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
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
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
      <div className="rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Contact
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total Due
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Paid
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Balance
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
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
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {student.fullName}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm text-gray-500">{student.email}</div>
                        <div className="text-sm text-gray-500">{student.phone}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="text-sm font-medium text-gray-900">
                          ${payment.totalDue.toFixed(2)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="text-sm font-medium text-green-600">
                          ${payment.paid.toFixed(2)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div
                          className={`text-sm font-medium ${
                            payment.balance > 0 ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          ${payment.balance.toFixed(2)}
                        </div>
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
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudent(student);
                              setIsPaymentModalOpen(true);
                            }}
                            className="text-primary hover:text-opacity-80"
                          >
                            Add Payment
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudent(student);
                              setIsHistoryModalOpen(true);
                            }}
                            className="text-primary hover:text-opacity-80"
                          >
                            View History
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
      </div>
      )}

      {/* BDP Integration Notice */}
      <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-6">
        <h3 className="mb-2 font-semibold text-blue-900">Budget Drive Protocol Integration</h3>
        <div className="space-y-2 text-sm text-blue-800">
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
      />
    </div>
  );
};
