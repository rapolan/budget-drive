import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, CreditCard, TrendingUp, Search, Plus, Check, X } from 'lucide-react';
import { studentsApi } from '@/api';
import { PaymentModal, PaymentHistoryModal } from '@/components/payments';
import type { Student } from '@/types';

export const PaymentsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Error state
  if (error) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments & Balances</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track student payments and account balances
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedStudent(null);
            setIsPaymentModalOpen(true);
          }}
          className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:bg-opacity-90"
        >
          <Plus className="mr-2 h-5 w-5" />
          Record Payment
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-6 md:grid-cols-3">
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
        <div className="grid gap-4 md:grid-cols-2">
          {/* Search */}
          <div className="flex items-center rounded-md border border-gray-300 bg-white px-4 py-2">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by student name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ml-2 flex-1 border-none bg-transparent outline-none"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="rounded-md border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid in Full</option>
            <option value="partial">Partial Payment</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Payments Table */}
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
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No students found
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
