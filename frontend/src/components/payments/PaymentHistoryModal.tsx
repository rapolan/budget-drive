import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, DollarSign, Calendar, CreditCard, FileText } from 'lucide-react';
import { paymentsApi } from '@/api';
import type { Student } from '@/types';

interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
}

export const PaymentHistoryModal: React.FC<PaymentHistoryModalProps> = ({
  isOpen,
  onClose,
  student,
}) => {
  // Fetch payment history for this student
  const { data: paymentsData, isLoading, error } = useQuery({
    queryKey: ['payments', 'student', student?.id],
    queryFn: () => paymentsApi.getByStudent(student!.id),
    enabled: !!student?.id && isOpen,
  });

  const payments = paymentsData?.data || [];

  if (!isOpen) return null;

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: 'Cash',
      credit_card: 'Credit Card',
      debit_card: 'Debit Card',
      check: 'Check',
      bank_transfer: 'Bank Transfer',
      e_transfer: 'E-Transfer',
      other: 'Other',
    };
    return labels[method] || method;
  };

  const getPaymentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      lesson_payment: 'Lesson Payment',
      package_payment: 'Package Payment',
      registration_fee: 'Registration Fee',
      exam_fee: 'Exam Fee',
      other: 'Other',
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-4xl rounded-lg bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-semibold text-gray-900">Payment History</h2>
              </div>
              {student && (
                <p className="mt-1 text-sm text-gray-600">
                  {student.fullName} ({student.email})
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {/* Summary */}
            {student && (
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm font-medium text-gray-700">Total Paid</p>
                  <p className="mt-1 text-2xl font-bold text-green-600">
                    ${(Number(student.totalPaid) || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm font-medium text-gray-700">Outstanding</p>
                  <p className="mt-1 text-2xl font-bold text-red-600">
                    ${(Number(student.outstandingBalance) || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm font-medium text-gray-700">Total Payments</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{payments.length}</p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">
                  Failed to load payment history. Please try again.
                </p>
              </div>
            )}

            {/* Payment List */}
            {!isLoading && !error && (
              <>
                {payments.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
                    <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-600">No payments recorded yet</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Method
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                              Amount
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Notes
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {payments.map((payment) => (
                            <tr key={payment.id} className="hover:bg-gray-50">
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="flex items-center gap-2 text-sm text-gray-900">
                                  <Calendar className="h-4 w-4 text-gray-400" />
                                  {new Date(payment.date).toLocaleDateString()}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="text-sm text-gray-900">
                                  {getPaymentTypeLabel(payment.paymentType)}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="flex items-center gap-2 text-sm text-gray-900">
                                  <CreditCard className="h-4 w-4 text-gray-400" />
                                  {getPaymentMethodLabel(payment.paymentMethod)}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <div className="text-sm font-semibold text-green-600">
                                  ${Number(payment.amount).toFixed(2)}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-center">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${getStatusBadge(
                                    payment.status
                                  )}`}
                                >
                                  {payment.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="max-w-xs truncate text-sm text-gray-500">
                                  {payment.notes || '-'}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-gray-200 px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
