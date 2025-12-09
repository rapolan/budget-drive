import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { vehiclesApi } from '@/api';
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

  useEffect(() => {
    if (vehicle) {
      setFormData({
        ownershipType: vehicle.ownershipType,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        licensePlate: vehicle.licensePlate,
        vin: vehicle.vin || '',
        color: vehicle.color || '',
        registrationExpiration: new Date(vehicle.registrationExpiration).toISOString().split('T')[0],
        insuranceProvider: vehicle.insuranceProvider || '',
        insurancePolicyNumber: vehicle.insurancePolicyNumber || '',
        insuranceExpiration: new Date(vehicle.insuranceExpiration).toISOString().split('T')[0],
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
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditing ? 'Edit Vehicle' : 'Add New Vehicle'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Make */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Make *
              </label>
              <input
                type="text"
                name="make"
                value={formData.make}
                onChange={handleChange}
                required
                placeholder="e.g., Toyota"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Model *
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleChange}
                required
                placeholder="e.g., Corolla"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Year */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Year *
              </label>
              <input
                type="number"
                name="year"
                value={formData.year}
                onChange={handleChange}
                required
                min="1900"
                max={new Date().getFullYear() + 1}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Color
              </label>
              <input
                type="text"
                name="color"
                value={formData.color}
                onChange={handleChange}
                placeholder="e.g., Silver"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* License Plate */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                License Plate *
              </label>
              <input
                type="text"
                name="licensePlate"
                value={formData.licensePlate}
                onChange={handleChange}
                required
                placeholder="e.g., ABC 1234"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* VIN */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                VIN *
              </label>
              <input
                type="text"
                name="vin"
                value={formData.vin}
                onChange={handleChange}
                required
                placeholder="Vehicle Identification Number"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Ownership Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Ownership Type
              </label>
              <select
                name="ownershipType"
                value={formData.ownershipType}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="school_owned">School Owned</option>
                <option value="instructor_owned">Instructor Owned</option>
                <option value="leased">Leased</option>
              </select>
            </div>

            {/* Current Mileage */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Current Mileage
              </label>
              <input
                type="number"
                name="currentMileage"
                value={formData.currentMileage}
                onChange={handleChange}
                min="0"
                placeholder="e.g., 50000"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Registration Expiration */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Registration Expiration *
              </label>
              <input
                type="date"
                name="registrationExpiration"
                value={formData.registrationExpiration}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Insurance Expiration */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Insurance Expiration *
              </label>
              <input
                type="date"
                name="insuranceExpiration"
                value={formData.insuranceExpiration}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Insurance Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Insurance Provider
              </label>
              <input
                type="text"
                name="insuranceProvider"
                value={formData.insuranceProvider}
                onChange={handleChange}
                placeholder="e.g., State Farm"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Insurance Policy Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Insurance Policy Number
              </label>
              <input
                type="text"
                name="insurancePolicyNumber"
                value={formData.insurancePolicyNumber}
                onChange={handleChange}
                placeholder="Policy #"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Notes */}
            <div className="col-span-1 sm:col-span-2">
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

          {/* Submit Button */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {isEditing ? 'Update' : 'Create'} Vehicle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
