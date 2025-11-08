import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { studentsApi } from '@/api';
import type { Student, CreateStudentInput } from '@/types';

interface StudentModalProps {
  student: Student | null;
  onClose: () => void;
}

export const StudentModal: React.FC<StudentModalProps> = ({ student, onClose }) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(student);

  const [formData, setFormData] = useState<CreateStudentInput>({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    learnerPermitNumber: '',
    learnerPermitExpiration: '',
    notes: '',
  });

  useEffect(() => {
    if (student) {
      setFormData({
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
        address: student.address || '',
        emergencyContactName: student.emergencyContactName || '',
        emergencyContactPhone: student.emergencyContactPhone || '',
        learnerPermitNumber: student.learnerPermitNumber || '',
        learnerPermitExpiration: student.learnerPermitExpiration
          ? new Date(student.learnerPermitExpiration).toISOString().split('T')[0]
          : '',
        notes: student.notes || '',
      });
    }
  }, [student]);

  const createMutation = useMutation({
    mutationFn: (data: CreateStudentInput) => studentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateStudentInput) => studentsApi.update(student!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditing) {
      await updateMutation.mutateAsync(formData);
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditing ? 'Edit Student' : 'Add New Student'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Full Name *
              </label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Phone *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Date of Birth
              </label>
              <input
                type="date"
                name="dateOfBirth"
                value={formData.dateOfBirth}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Learner Permit Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Learner Permit Number
              </label>
              <input
                type="text"
                name="learnerPermitNumber"
                value={formData.learnerPermitNumber}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Learner Permit Expiration */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Permit Expiration
              </label>
              <input
                type="date"
                name="learnerPermitExpiration"
                value={formData.learnerPermitExpiration}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Address */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Emergency Contact Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Emergency Contact Name
              </label>
              <input
                type="text"
                name="emergencyContactName"
                value={formData.emergencyContactName}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Emergency Contact Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Emergency Contact Phone
              </label>
              <input
                type="tel"
                name="emergencyContactPhone"
                value={formData.emergencyContactPhone}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : isEditing
                ? 'Update Student'
                : 'Create Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
