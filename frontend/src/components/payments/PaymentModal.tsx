import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, DollarSign, CreditCard, Calendar, User } from 'lucide-react';
import { paymentsApi, studentsApi } from '@/api';
import type { CreatePaymentInput, Student } from '@/types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  student,
}) => {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<CreatePaymentInput>({
    studentId: '',
    amount: 0,
    paymentMethod: 'cash',
    paymentType: 'lesson_payment',
    date: new Date().toISOString().split('T')[0],
    status: 'confirmed',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch all students for dropdown (when no student is pre-selected)
  const { data: studentsData } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
    enabled: !student && isOpen,
  });

  const students = studentsData?.data || [];
  const selectedStudentData = student || students.find(s => s.id === formData.studentId);

  // Update form data when student changes
  useEffect(() => {
    if (student) {
      setFormData((prev) => ({
        ...prev,
        studentId: student.id,
      }));
    }
  }, [student]);

  // Create payment mutation
  const createMutation = useMutation({
    mutationFn: (data: CreatePaymentInput) => paymentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      console.error('Failed to create payment:', error);
      setErrors({
        submit: error.response?.data?.error || 'Failed to record payment. Please try again.',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      studentId: student?.id || '',
      amount: 0,
      paymentMethod: 'cash',
      paymentType: 'lesson_payment',
      date: new Date().toISOString().split('T')[0],
      status: 'confirmed',
      notes: '',
    });
    setErrors({});
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) || 0 : value,
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.studentId) {
      newErrors.studentId = 'Please select a student';
    }
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }
    if (!formData.paymentMethod) {
      newErrors.paymentMethod = 'Payment method is required';
    }
    if (!formData.date) {
      newErrors.date = 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      createMutation.mutate(formData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-2xl rounded-lg bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-semibold text-gray-900">Record Payment</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="px-6 py-4">
            {/* Student Info or Selector */}
            {student ? (
              <div className="mb-6 rounded-lg bg-blue-50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Student</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {student.fullName}
                    </p>
                    <p className="text-sm text-gray-600">{student.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-700">Current Balance</p>
                    <p className="mt-1 text-lg font-semibold text-red-600">
                      ${(Number(student.outstandingBalance) || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700">
                  Select Student <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    name="studentId"
                    value={formData.studentId}
                    onChange={handleChange}
                    className="block w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">-- Choose a student --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.email})
                      </option>
                    ))}
                  </select>
                </div>
                {errors.studentId && (
                  <p className="mt-1 text-sm text-red-600">{errors.studentId}</p>
                )}
                {selectedStudentData && (
                  <div className="mt-2 rounded-md bg-blue-50 p-3">
                    <p className="text-sm font-medium text-gray-700">Current Balance</p>
                    <p className="mt-1 text-lg font-semibold text-red-600">
                      ${(Number(selectedStudentData.outstandingBalance) || 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <DollarSign className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    className="block w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="0.00"
                  />
                </div>
                {errors.amount && (
                  <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <CreditCard className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    name="paymentMethod"
                    value={formData.paymentMethod}
                    onChange={handleChange}
                    className="block w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="cash">Cash</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                    <option value="check">Check</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="e_transfer">E-Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {errors.paymentMethod && (
                  <p className="mt-1 text-sm text-red-600">{errors.paymentMethod}</p>
                )}
              </div>

              {/* Payment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Payment Type
                </label>
                <select
                  name="paymentType"
                  value={formData.paymentType}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="lesson_payment">Lesson Payment</option>
                  <option value="package_payment">Package Payment</option>
                  <option value="registration_fee">Registration Fee</option>
                  <option value="exam_fee">Exam Fee</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Date <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    className="block w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {errors.date && <p className="mt-1 text-sm text-red-600">{errors.date}</p>}
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Additional payment notes..."
                />
              </div>
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="mt-4 rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-800">{errors.submit}</p>
              </div>
            )}

            {/* BDP Notice */}
            <div className="mt-4 rounded-md border-l-4 border-blue-500 bg-blue-50 p-3">
              <p className="text-sm text-blue-800">
                <strong>BDP Integration:</strong> Recording this payment will update the
                student's balance and may trigger BSV blockchain treasury transactions.
              </p>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
