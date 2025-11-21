import { apiClient } from './client';
import {
  InstructorAvailability,
  InstructorTimeOff,
  SchedulingSettings,
  TimeSlot,
  SchedulingConflict,
  CreateAvailabilityInput,
  CreateTimeOffInput,
  FindSlotsRequest,
  CheckConflictsRequest,
  ApiResponse,
} from '@/types';

/**
 * Scheduling & Availability API
 * Phase 4A - Smart Scheduling Foundation
 */
export const schedulingApi = {
  // ===================================================================
  // INSTRUCTOR AVAILABILITY
  // ===================================================================

  /**
   * Get all availability slots for an instructor
   */
  async getInstructorAvailability(instructorId: string): Promise<InstructorAvailability[]> {
    const response = await apiClient.get<ApiResponse<InstructorAvailability[]>>(
      `/availability/instructor/${instructorId}`
    );
    return response.data.data || [];
  },

  /**
   * Get all instructors' availability (admin view)
   */
  async getAllInstructorsAvailability(): Promise<InstructorAvailability[]> {
    const response = await apiClient.get<ApiResponse<InstructorAvailability[]>>(
      '/availability/all'
    );
    return response.data.data || [];
  },

  /**
   * Create a new availability slot for an instructor
   * Note: instructorId must be provided in the data object
   */
  async createAvailability(data: CreateAvailabilityInput & { instructorId: string }): Promise<InstructorAvailability> {
    const { instructorId, ...availabilityData } = data;
    const response = await apiClient.post<ApiResponse<InstructorAvailability>>(
      `/availability/instructor/${instructorId}`,
      availabilityData
    );
    return response.data.data!;
  },

  /**
   * Update an existing availability slot
   */
  async updateAvailability(
    id: string,
    data: Partial<CreateAvailabilityInput>
  ): Promise<InstructorAvailability> {
    const response = await apiClient.put<ApiResponse<InstructorAvailability>>(
      `/availability/${id}`,
      data
    );
    return response.data.data!;
  },

  /**
   * Delete an availability slot
   */
  async deleteAvailability(id: string): Promise<void> {
    await apiClient.delete(`/availability/${id}`);
  },

  // ===================================================================
  // TIME OFF MANAGEMENT
  // ===================================================================

  /**
   * Get all time off requests for an instructor
   */
  async getInstructorTimeOff(instructorId: string): Promise<InstructorTimeOff[]> {
    const response = await apiClient.get<ApiResponse<InstructorTimeOff[]>>(
      `/availability/instructor/${instructorId}/time-off`
    );
    return response.data.data || [];
  },

  /**
   * Get all time off requests (admin view, optionally filtered by status)
   * Note: This endpoint may not be implemented yet on the backend
   */
  async getAllTimeOff(status?: 'pending' | 'approved' | 'rejected'): Promise<InstructorTimeOff[]> {
    const url = status ? `/availability/time-off?status=${status}` : '/availability/time-off';
    const response = await apiClient.get<ApiResponse<InstructorTimeOff[]>>(url);
    return response.data.data || [];
  },

  /**
   * Create a new time off request
   * Note: instructorId must be provided in the data object
   */
  async createTimeOff(data: CreateTimeOffInput & { instructorId: string }): Promise<InstructorTimeOff> {
    const { instructorId, ...timeOffData } = data;
    const response = await apiClient.post<ApiResponse<InstructorTimeOff>>(
      `/availability/instructor/${instructorId}/time-off`,
      timeOffData
    );
    return response.data.data!;
  },

  /**
   * Update a time off request
   */
  async updateTimeOff(
    id: string,
    data: Partial<CreateTimeOffInput>
  ): Promise<InstructorTimeOff> {
    const response = await apiClient.put<ApiResponse<InstructorTimeOff>>(
      `/availability/time-off/${id}`,
      data
    );
    return response.data.data!;
  },

  /**
   * Delete a time off request
   */
  async deleteTimeOff(id: string): Promise<void> {
    await apiClient.delete(`/availability/time-off/${id}`);
  },

  // ===================================================================
  // SCHEDULING SETTINGS
  // ===================================================================

  /**
   * Get scheduling settings for the tenant
   */
  async getSchedulingSettings(): Promise<SchedulingSettings> {
    const response = await apiClient.get<ApiResponse<SchedulingSettings>>(
      '/availability/settings'
    );
    return response.data.data!;
  },

  /**
   * Update scheduling settings
   */
  async updateSchedulingSettings(
    data: Partial<Omit<SchedulingSettings, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<SchedulingSettings> {
    const response = await apiClient.put<ApiResponse<SchedulingSettings>>(
      '/availability/settings',
      data
    );
    return response.data.data!;
  },

  // ===================================================================
  // SMART SCHEDULING
  // ===================================================================

  /**
   * Find available time slots based on criteria
   */
  async findAvailableSlots(request: FindSlotsRequest): Promise<TimeSlot[]> {
    const response = await apiClient.post<ApiResponse<TimeSlot[]>>(
      '/availability/find-slots',
      request
    );
    return response.data.data || [];
  },

  /**
   * Check for scheduling conflicts
   */
  async checkConflicts(request: CheckConflictsRequest): Promise<SchedulingConflict[]> {
    const response = await apiClient.post<ApiResponse<SchedulingConflict[]>>(
      '/availability/check-conflicts',
      request
    );
    return response.data.data || [];
  },

  /**
   * Validate a booking before creating a lesson
   */
  async validateBooking(request: CheckConflictsRequest): Promise<{
    valid: boolean;
    conflicts: SchedulingConflict[];
  }> {
    const response = await apiClient.post<
      ApiResponse<{ valid: boolean; conflicts: SchedulingConflict[] }>
    >('/availability/validate-booking', request);
    return response.data.data || { valid: false, conflicts: [] };
  },
};
