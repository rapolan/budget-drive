import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { vehiclesApi, instructorsApi } from '@/api';
import type { Vehicle, CreateVehicleInput } from '@/types';

interface VehicleModalProps {
  vehicle: Vehicle | null;
  onClose: () => void;
}

export const VehicleModal: React.FC<VehicleModalProps> = ({ vehicle, onClose }) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(vehicle);

  const [formData, setFormData] = useState<CreateVehicleInput>({
    ownershipType: 'school_owned',
    ownerInstructorId: null,
    make: '',
    model: '',
    year: new Date().getFullYear(),
    licensePlate: '',
    vin: '',
    color: '',
    registrationExpiration: '',
    insuranceProvider: '',
    insurancePolicyNumber: '',
    insuranceExpiration: '',
    currentMileage: 0,
    notes: '',
  });

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  useEffect(() => {
    if (vehicle) {
      setFormData({
        ownershipType: vehicle.ownershipType,
        ownerInstructorId: vehicle.ownerInstructorId || null,
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year || new Date().getFullYear(),
        licensePlate: vehicle.licensePlate || '',
        vin: vehicle.vin || '',
        color: vehicle.color || '',
        registrationExpiration: vehicle.registrationExpiration
          ? new Date(vehicle.registrationExpiration).toISOString().split('T')[0]
          : '',
        insuranceProvider: vehicle.insuranceProvider || '',
        insurancePolicyNumber: vehicle.insurancePolicyNumber || '',
        insuranceExpiration: vehicle.insuranceExpiration
          ? new Date(vehicle.insuranceExpiration).toISOString().split('T')[0]
          : '',
        currentMileage: vehicle.currentMileage || 0,
        notes: vehicle.notes || '',
      });
    }
  }, [vehicle]);

  const createMutation = useMutation({
    mutationFn: (data: CreateVehicleInput) => vehiclesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateVehicleInput) => vehiclesApi.update(vehicle!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onClose();
    },
  });

  const activeMutation = isEditing ? updateMutation : createMutation;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isEditing) {
        await updateMutation.mutateAsync(formData);
      } else {
        await createMutation.mutateAsync(formData);
      }
    } catch {
      // Already surfaced via activeMutation.isError below - swallow here
      // so a rejected mutation doesn't also throw as an unhandled promise
      // rejection out of this submit handler.
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === 'number' ? (value === '' ? undefined : parseInt(value) || 0) : value,
      };
      // Owning instructor only makes sense for instructor-owned vehicles -
      // clear it when switching away so a stale id never gets submitted.
      if (name === 'ownershipType' && value !== 'instructor_owned') {
        next.ownerInstructorId = null;
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-tx-primary">
            {isEditing ? 'Edit Vehicle' : 'Add New Vehicle'}
          </h2>
          <button
            onClick={onClose}
            className="text-tx-muted hover:text-tx-secondary"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Make */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Make
              </label>
              <input
                type="text"
                name="make"
                value={formData.make}
                onChange={handleChange}
                autoComplete="nope"
                placeholder="e.g., Toyota (can be filled in later)"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Model
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleChange}
                autoComplete="nope"
                placeholder="e.g., Corolla (can be filled in later)"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Year */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Year
              </label>
              <input
                type="number"
                name="year"
                value={formData.year || ''}
                onChange={handleChange}
                autoComplete="nope"
                min="1900"
                max={new Date().getFullYear() + 1}
                placeholder="Can be filled in later"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Color
              </label>
              <input
                type="text"
                name="color"
                value={formData.color}
                onChange={handleChange}
                autoComplete="nope"
                placeholder="e.g., Silver"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* License Plate */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                License Plate
              </label>
              <input
                type="text"
                name="licensePlate"
                value={formData.licensePlate}
                onChange={handleChange}
                autoComplete="nope"
                placeholder="e.g., ABC 1234 (can be filled in later)"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* VIN */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                VIN
              </label>
              <input
                type="text"
                name="vin"
                value={formData.vin}
                onChange={handleChange}
                autoComplete="nope"
                placeholder="Vehicle Identification Number (optional)"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Ownership Type */}
            <div>
              <label htmlFor="vehicle-ownership-type" className="block text-sm font-medium text-tx-secondary">
                Ownership Type *
              </label>
              <select
                id="vehicle-ownership-type"
                name="ownershipType"
                value={formData.ownershipType}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="school_owned">School Owned</option>
                <option value="instructor_owned">Instructor Owned</option>
                <option value="leased">Leased</option>
              </select>
            </div>

            {/* Owner Instructor - only when instructor-owned, and required in that case */}
            {formData.ownershipType === 'instructor_owned' && (
              <div>
                <label htmlFor="vehicle-owner-instructor" className="block text-sm font-medium text-tx-secondary">
                  Owning Instructor *
                </label>
                <select
                  id="vehicle-owner-instructor"
                  name="ownerInstructorId"
                  value={formData.ownerInstructorId || ''}
                  onChange={handleChange}
                  required
                  className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select an instructor...</option>
                  {instructorsData?.data?.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.fullName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Current Mileage */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Current Mileage
              </label>
              <input
                type="number"
                name="currentMileage"
                value={formData.currentMileage}
                onChange={handleChange}
                min="0"
                autoComplete="nope"
                placeholder="e.g., 50000"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Registration Expiration */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Registration Expiration
              </label>
              <input
                type="date"
                name="registrationExpiration"
                value={formData.registrationExpiration}
                onChange={handleChange}
                autoComplete="nope"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Insurance Expiration */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Insurance Expiration
              </label>
              <input
                type="date"
                name="insuranceExpiration"
                value={formData.insuranceExpiration}
                onChange={handleChange}
                autoComplete="nope"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Insurance Provider */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Insurance Provider
              </label>
              <input
                type="text"
                name="insuranceProvider"
                value={formData.insuranceProvider}
                onChange={handleChange}
                autoComplete="nope"
                placeholder="e.g., State Farm"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Insurance Policy Number */}
            <div>
              <label className="block text-sm font-medium text-tx-secondary">
                Insurance Policy Number
              </label>
              <input
                type="text"
                name="insurancePolicyNumber"
                value={formData.insurancePolicyNumber}
                onChange={handleChange}
                autoComplete="nope"
                placeholder="Policy #"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Notes */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-sm font-medium text-tx-secondary">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Error - a failed create/update (e.g. an instructor-owned
              vehicle with no owning instructor selected) must be visible,
              not silent - previously this modal had no error display at
              all, so a rejected request looked exactly like a dead button. */}
          {activeMutation.isError && (
            <p className="text-sm text-status-danger-text">
              {(activeMutation.error as Error & { response?: { data?: { error?: string } } })?.response?.data?.error
                || 'Failed to save vehicle. Please try again.'}
            </p>
          )}

          {/* Submit Button */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-edge mt-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-edge-strong bg-surface px-4 py-2 text-sm font-medium text-tx-secondary hover:bg-surface2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={activeMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:brightness-90 hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {activeMutation.isPending ? 'Saving...' : `${isEditing ? 'Update' : 'Create'} Vehicle`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
