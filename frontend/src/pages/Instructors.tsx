import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { instructorsApi } from '@/api';
import type { Instructor } from '@/types';
import { InstructorModal } from '@/components/instructors/InstructorModal';

export const InstructorsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => instructorsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
    },
  });

  const handleEdit = (instructor: Instructor) => {
    setSelectedInstructor(instructor);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this instructor?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleAddNew = () => {
    setSelectedInstructor(null);
    setIsModalOpen(true);
  };

  const filteredInstructors = data?.data?.filter((instructor) =>
    instructor.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instructor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instructor.phone.includes(searchTerm)
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'on_leave':
        return 'bg-yellow-100 text-yellow-800';
      case 'terminated':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getEmploymentTypeLabel = (type: string) => {
    switch (type) {
      case 'w2_employee':
        return 'W2 Employee';
      case '1099_contractor':
        return '1099 Contractor';
      case 'volunteer':
        return 'Volunteer';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Instructors</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your driving school instructors
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Instructor
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center rounded-md border border-gray-300 bg-white px-4 py-2">
        <Search className="h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search instructors by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ml-2 flex-1 border-none bg-transparent outline-none"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Employment
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Hourly Rate
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
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredInstructors?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No instructors found
                </td>
              </tr>
            ) : (
              filteredInstructors?.map((instructor) => (
                <tr key={instructor.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="font-medium text-gray-900">{instructor.fullName}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">{instructor.email}</div>
                    <div className="text-sm text-gray-500">{instructor.phone}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {getEmploymentTypeLabel(instructor.employmentType)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Hired: {new Date(instructor.hireDate).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {instructor.hourlyRate ? `$${Number(instructor.hourlyRate).toFixed(2)}/hr` : 'N/A'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusColor(
                        instructor.status
                      )}`}
                    >
                      {instructor.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(instructor)}
                        className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                        title="Edit instructor"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(instructor.id)}
                        className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
                        title="Delete instructor"
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

      {/* Modal */}
      {isModalOpen && (
        <InstructorModal
          instructor={selectedInstructor}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedInstructor(null);
          }}
        />
      )}
    </div>
  );
};
