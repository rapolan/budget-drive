import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, Car, LayoutGrid, LayoutList, Gauge, Hash } from 'lucide-react';
import { vehiclesApi } from '@/api';
import type { Vehicle } from '@/types';
import { VehicleModal } from '@/components/vehicles/VehicleModal';
import { EmptyState, LoadingSpinner, BackButton } from '@/components/common';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

type ViewMode = 'table' | 'cards';

export const VehiclesPage: React.FC = () => {
  // Enable swipe-to-go-back on mobile
  useSwipeNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
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
        return 'bg-surface2 text-tx-primary';
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
          <h1 className="text-xl sm:text-2xl font-bold text-tx-primary mt-2">Vehicles</h1>
          <p className="mt-1 text-sm text-tx-muted">
            Manage your driving school vehicles
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-surface p-1">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-blue-100 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
              title="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-blue-100 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleAddNew}
            className="flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all"
          >
            <Plus className="mr-2 h-5 w-5 flex-shrink-0" />
            Add Vehicle
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center rounded-lg border border-[var(--border-strong)] bg-surface px-4 py-2 focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
        <Search className="h-5 w-5 text-tx-muted flex-shrink-0" />
        <input
          type="text"
          placeholder="Search vehicles by make, model, or plate..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="nope"
          className="ml-2 flex-1 border-none bg-transparent outline-none"
        />
      </div>

      {/* Card View - Mobile Friendly */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full py-12">
              <LoadingSpinner />
            </div>
          ) : filteredVehicles?.length === 0 ? (
            <div className="col-span-full">
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
                    className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary transition-colors"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Vehicle
                  </button>
                }
              />
            </div>
          ) : (
            filteredVehicles?.map((vehicle) => (
              <div
                key={vehicle.id}
                onClick={() => handleEdit(vehicle)}
                className={`bg-surface rounded-xl shadow-sm border-2 p-5 hover:shadow-md transition-all cursor-pointer ${
                  vehicle.status === 'active' ? 'border-green-200 hover:border-green-300' :
                  vehicle.status === 'maintenance' ? 'border-yellow-200' :
                  vehicle.status === 'retired' ? 'border-red-200' :
                  'border-[var(--border)] hover:brightness-110 hover:border-primary'
                }`}
              >
                {/* Header - Vehicle Name & Status */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0">
                      <Car className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-tx-primary truncate">
                        {vehicle.year} {vehicle.make}
                      </h3>
                      <p className="text-sm text-tx-muted truncate">{vehicle.model}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${getStatusColor(vehicle.status)}`}>
                    {vehicle.status}
                  </span>
                </div>

                {/* Vehicle Details */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="h-4 w-4 text-tx-muted flex-shrink-0" />
                    <span className="font-medium text-tx-primary">{vehicle.licensePlate}</span>
                  </div>
                  {vehicle.color && (
                    <div className="flex items-center gap-2 text-sm text-tx-secondary">
                      <div
                        className="w-4 h-4 rounded-full border border-[var(--border-strong)] flex-shrink-0"
                        style={{ backgroundColor: vehicle.color.toLowerCase() }}
                      />
                      <span className="capitalize">{vehicle.color}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-tx-secondary">
                    <Gauge className="h-4 w-4 text-tx-muted flex-shrink-0" />
                    <span>{vehicle.currentMileage?.toLocaleString() || 0} mi</span>
                  </div>
                </div>

                {/* Ownership Badge */}
                <div className="mb-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-surface2 text-tx-secondary">
                    {getOwnershipLabel(vehicle.ownershipType)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(vehicle);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 hover:bg-primary transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(vehicle.id);
                    }}
                    className="p-2 text-tx-secondary hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Table */}
      {viewMode === 'table' && (
      <div className="rounded-lg bg-surface shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-surface2">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                Vehicle
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                License Plate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                Ownership
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                Mileage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-tx-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] bg-surface">
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
                        className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary transition-colors"
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
                <tr key={vehicle.id} className="hover:bg-surface2">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="font-medium text-tx-primary">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </div>
                    {vehicle.color && (
                      <div className="text-sm text-tx-muted">{vehicle.color}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-tx-primary">
                    {vehicle.licensePlate}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-tx-primary">
                      {getOwnershipLabel(vehicle.ownershipType)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-tx-muted">
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
                        type="button"
                        onClick={() => handleEdit(vehicle)}
                        className="p-2 text-primary hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                        title="Edit vehicle"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
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
      )}

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
