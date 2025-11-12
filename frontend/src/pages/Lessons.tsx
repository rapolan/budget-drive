import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, X, CheckCircle } from 'lucide-react';
import { lessonsApi, studentsApi, instructorsApi, vehiclesApi } from '@/api';
import type { Lesson } from '@/types';
import { LessonModal } from '@/components/lessons/LessonModal';

export const LessonsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['lessons', currentPage],
    queryFn: () => lessonsApi.getAll(currentPage, 50),
  });

  // Fetch related data for display
  const { data: studentsData } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
  });

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.getAll(),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
    },
  });

  const handleEdit = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setIsModalOpen(true);
  };

  const handleCancel = async (id: string) => {
    if (window.confirm('Are you sure you want to cancel this lesson?')) {
      await cancelMutation.mutateAsync(id);
    }
  };

  const handleComplete = async (id: string) => {
    if (window.confirm('Mark this lesson as completed?')) {
      await completeMutation.mutateAsync(id);
    }
  };

  const handleAddNew = () => {
    setSelectedLesson(null);
    setIsModalOpen(true);
  };

  // Helper functions to get names from IDs
  const getStudentName = (studentId: string) => {
    const student = studentsData?.data?.find((s) => s.id === studentId);
    return student?.fullName || 'Unknown Student';
  };

  const getInstructorName = (instructorId: string) => {
    const instructor = instructorsData?.data?.find((i) => i.id === instructorId);
    return instructor?.fullName || 'Unknown Instructor';
  };

  const getVehicleInfo = (vehicleId: string) => {
    const vehicle = vehiclesData?.data?.find((v) => v.id === vehicleId);
    return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Unknown Vehicle';
  };

  const filteredLessons = data?.data?.filter((lesson) => {
    const studentName = getStudentName(lesson.studentId).toLowerCase();
    const instructorName = getInstructorName(lesson.instructorId).toLowerCase();
    const search = searchTerm.toLowerCase();
    return (
      studentName.includes(search) ||
      instructorName.includes(search) ||
      lesson.lessonType.toLowerCase().includes(search) ||
      lesson.status.toLowerCase().includes(search)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'no_show':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    // Convert HH:MM:SS to HH:MM AM/PM
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lessons</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage driving lessons and appointments
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:bg-opacity-90"
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Lesson
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center rounded-md border border-gray-300 bg-white px-4 py-2">
        <Search className="h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by student, instructor, type, or status..."
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
                Date & Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Student
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Instructor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Vehicle
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Cost
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredLessons?.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                  No lessons found
                </td>
              </tr>
            ) : (
              filteredLessons?.map((lesson) => (
                <tr key={lesson.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(lesson.date)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">{getStudentName(lesson.studentId)}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">{getInstructorName(lesson.instructorId)}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-500">{getVehicleInfo(lesson.vehicleId)}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900 capitalize">
                      {lesson.lessonType.replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 capitalize ${getStatusColor(
                        lesson.status
                      )}`}
                    >
                      {lesson.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    ${lesson.cost.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {lesson.status === 'scheduled' && (
                        <>
                          <button
                            onClick={() => handleEdit(lesson)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit lesson"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleComplete(lesson.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Mark as completed"
                          >
                            <CheckCircle className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleCancel(lesson.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Cancel lesson"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      {lesson.status !== 'scheduled' && (
                        <span className="text-gray-400 text-xs">No actions</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-lg">
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
        <LessonModal
          lesson={selectedLesson}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedLesson(null);
          }}
        />
      )}
    </div>
  );
};
