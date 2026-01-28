import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, Car } from 'lucide-react';
import { vehiclesApi } from '@/api';
import type { Vehicle } from '@/types';
import { VehicleModal } from '@/components/vehicles/VehicleModal';
import { EmptyState, LoadingSpinner, BackButton } from '@/components/common';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

export const VehiclesPage: React.FC = () => {
  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vehiclesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const handleEdit = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this vehicle?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleAddNew = () => {
    setSelectedVehicle(null);
    setIsModalOpen(true);
  };

  const filteredVehicles = data?.data?.filter((vehicle) =>
    vehicle.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.licensePlate.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      case 'retired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getOwnershipLabel = (type: string) => {
    switch (type) {
      case 'school_owned':
        return 'School Owned';
      case 'instructor_owned':
        return 'Instructor Owned';
      case 'leased':
        return 'Leased';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">Vehicles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your driving school vehicles
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
        >
          <Plus className="mr-2 h-5 w-5 flex-shrink-0" />
          Add Vehicle
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
        <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search vehicles by make, model, or plate..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="nope"
          className="ml-2 flex-1 border-none bg-transparent outline-none"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Vehicle
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                License Plate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Ownership
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Mileage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12">
                  <LoadingSpinner />
                </td>
              </tr>
            ) : filteredVehicles?.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-2">
                  <EmptyState
                    icon={<Car className="h-12 w-12" />}
                    title="No vehicles found"
                    description={
                      searchTerm
                        ? `No vehicles match your search for "${searchTerm}"`
                        : "Get started by adding your first vehicle to the fleet"
                    }
                    action={
                      <button
                        type="button"
                        onClick={handleAddNew}
                        className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Vehicle
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredVehicles?.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </div>
                    {vehicle.color && (
                      <div className="text-sm text-gray-500">{vehicle.color}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {vehicle.licensePlate}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {getOwnershipLabel(vehicle.ownershipType)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {vehicle.currentMileage?.toLocaleString()} mi
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusColor(
                        vehicle.status
                      )}`}
                    >
                      {vehicle.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(vehicle)}
                        className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                        title="Edit vehicle"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(vehicle.id)}
                        className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
                        title="Delete vehicle"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <VehicleModal
          vehicle={selectedVehicle}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedVehicle(null);
          }}
        />
      )}
    </div>
  );
};
