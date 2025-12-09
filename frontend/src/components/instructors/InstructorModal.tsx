import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, UserCheck, Mail, Phone, Briefcase, DollarSign, MapPin, FileText, Calendar } from 'lucide-react';
import { instructorsApi } from '@/api';
import type { Instructor, CreateInstructorInput } from '@/types';
import { CalendarFeedSettings } from './CalendarFeedSettings';

interface InstructorModalProps {
  instructor: Instructor | null;
  onClose: () => void;
}

export const InstructorModal: React.FC<InstructorModalProps> = ({ instructor, onClose }) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(instructor);

  const [formData, setFormData] = useState<CreateInstructorInput>({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    licenseNumber: '',
    licenseExpiration: '',
    employmentType: 'w2_employee',
    hireDate: new Date().toISOString().split('T')[0],
    hourlyRate: 0,
    notes: '',
  });

  useEffect(() => {
    if (instructor) {
      setFormData({
        fullName: instructor.fullName,
        email: instructor.email,
        phone: instructor.phone,
        dateOfBirth: instructor.dateOfBirth ? new Date(instructor.dateOfBirth).toISOString().split('T')[0] : '',
        addressLine1: instructor.addressLine1 || '',
        addressLine2: instructor.addressLine2 || '',
        city: instructor.city || '',
        state: instructor.state || '',
        zipCode: instructor.zipCode || '',
        licenseNumber: instructor.licenseNumber || '',
        licenseExpiration: instructor.licenseExpiration
          ? new Date(instructor.licenseExpiration).toISOString().split('T')[0]
          : '',
        employmentType: instructor.employmentType,
        hireDate: new Date(instructor.hireDate).toISOString().split('T')[0],
        hourlyRate: instructor.hourlyRate || 0,
        notes: instructor.notes || '',
      });
    }
  }, [instructor]);

  const createMutation = useMutation({
    mutationFn: (data: CreateInstructorInput) => instructorsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateInstructorInput) => instructorsApi.update(instructor!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20">
                <UserCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {isEditing && instructor ? instructor.fullName : 'Add New Instructor'}
                </h2>
                {!isEditing && (
                  <p className="text-sm text-gray-500">Fill in the instructor details below</p>
                )}
                {isEditing && instructor?.email && (
                  <p className="text-sm text-gray-500">{instructor.email}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Personal Information Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <UserCheck className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">Personal Information</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  autoComplete="off"
                  placeholder="John Smith"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email *
                </label>
                <div className="mt-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="instructor@email.com"
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Phone *
                </label>
                <div className="mt-1 relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    placeholder="(555) 123-4567"
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                </div>
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
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* License Information Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">License Information</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* License Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  License Number
                </label>
                <input
                  type="text"
                  name="licenseNumber"
                  value={formData.licenseNumber}
                  onChange={handleChange}
                  placeholder="DL123456789"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>

              {/* License Expiration */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  License Expiration
                </label>
                <input
                  type="date"
                  name="licenseExpiration"
                  value={formData.licenseExpiration}
                  onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Employment Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">Employment Details</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Employment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Employment Type
                </label>
                <select
                  name="employmentType"
                  value={formData.employmentType}
                  onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                >
                  <option value="w2_employee">W2 Employee</option>
                  <option value="1099_contractor">1099 Contractor</option>
                  <option value="volunteer">Volunteer</option>
                </select>
              </div>

              {/* Hire Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Hire Date
                </label>
                <input
                  type="date"
                  name="hireDate"
                  value={formData.hireDate}
                  onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>

              {/* Hourly Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Hourly Rate
                </label>
                <div className="mt-1 relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    name="hourlyRate"
                    value={formData.hourlyRate}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    placeholder="35.00"
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">Address</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Address Line 1 */}
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Street Address
                </label>
                <input
                  type="text"
                  name="addressLine1"
                  value={formData.addressLine1}
                  onChange={handleChange}
                  placeholder="123 Main St"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>

              {/* Address Line 2 */}
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Apt, Suite, Unit (optional)
                </label>
                <input
                  type="text"
                  name="addressLine2"
                  value={formData.addressLine2}
                  onChange={handleChange}
                  placeholder="Apt 4B"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>

              {/* City */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  City
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  placeholder="San Diego"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>

              {/* State */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  State
                </label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="CA"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>

              {/* ZIP Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  ZIP Code
                </label>
                <input
                  type="text"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleChange}
                  placeholder="92101"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Calendar Feed Settings - only show when editing */}
          {isEditing && instructor && (
            <div className="border-t border-gray-100 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-4 w-4 text-purple-600" />
                <h3 className="text-sm font-semibold text-gray-900">Calendar Integration</h3>
              </div>
              <CalendarFeedSettings instructorId={instructor.id} />
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all hover:scale-105 active:scale-95"
            >
              {isEditing ? 'Update' : 'Create'} Instructor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
