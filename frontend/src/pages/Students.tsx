import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { studentsApi } from '@/api';
import type { Student } from '@/types';
import { StudentModal } from '@/components/students/StudentModal';

export const StudentsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['students', currentPage],
    queryFn: () => studentsApi.getAll(currentPage, 50),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const handleEdit = (student: Student) => {
    setSelectedStudent(student);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleAddNew = () => {
    setSelectedStudent(null);
    setIsModalOpen(true);
  };

  const filteredStudents = data?.data?.filter((student) =>
    student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.phone.includes(searchTerm)
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'dropped':
        return 'bg-gray-100 text-gray-800';
      case 'suspended':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your driving school students
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:bg-opacity-90"
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Student
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center rounded-md border border-gray-300 bg-white px-4 py-2">
        <Search className="h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search students by name, email, or phone..."
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
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Hours Completed
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Enrollment Date
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
            ) : filteredStudents?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No students found
                </td>
              </tr>
            ) : (
              filteredStudents?.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="font-medium text-gray-900">{student.fullName}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">{student.email}</div>
                    <div className="text-sm text-gray-500">{student.phone}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusColor(
                        student.status
                      )}`}
                    >
                      {student.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {student.totalHoursCompleted} hrs
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {new Date(student.enrollmentDate).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(student)}
                      className="mr-3 text-blue-600 hover:text-blue-900"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(student.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3">
          <div className="text-sm text-gray-700">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === data.pagination.totalPages}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <StudentModal
          student={selectedStudent}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedStudent(null);
          }}
        />
      )}
    </div>
  );
};
