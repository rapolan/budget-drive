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
      `/scheduling/availability/instructor/${instructorId}`
    );
    return response.data.data || [];
  },

  /**
   * Get all instructors' availability (admin view)
   */
  async getAllInstructorsAvailability(): Promise<Record<string, InstructorAvailability[]>> {
    const response = await apiClient.get<ApiResponse<Record<string, InstructorAvailability[]>>>(
      '/scheduling/availability/all'
    );
    return response.data.data || {};
  },

  /**
   * Create a new availability slot for an instructor
   */
  async createAvailability(data: CreateAvailabilityInput): Promise<InstructorAvailability> {
    const response = await apiClient.post<ApiResponse<InstructorAvailability>>(
      '/scheduling/availability',
      data
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
      `/scheduling/availability/${id}`,
      data
    );
    return response.data.data!;
  },

  /**
   * Delete an availability slot
   */
  async deleteAvailability(id: string): Promise<void> {
    await apiClient.delete(`/scheduling/availability/${id}`);
  },

  // ===================================================================
  // TIME OFF MANAGEMENT
  // ===================================================================

  /**
   * Get all time off requests for an instructor
   */
  async getInstructorTimeOff(instructorId: string): Promise<InstructorTimeOff[]> {
    const response = await apiClient.get<ApiResponse<InstructorTimeOff[]>>(
      `/scheduling/time-off/instructor/${instructorId}`
    );
    return response.data.data || [];
  },

  /**
   * Get all time off requests (admin view, optionally filtered by status)
   */
  async getAllTimeOff(status?: 'pending' | 'approved' | 'rejected'): Promise<InstructorTimeOff[]> {
    const url = status ? `/scheduling/time-off?status=${status}` : '/scheduling/time-off';
    const response = await apiClient.get<ApiResponse<InstructorTimeOff[]>>(url);
    return response.data.data || [];
  },

  /**
   * Create a new time off request
   */
  async createTimeOff(data: CreateTimeOffInput): Promise<InstructorTimeOff> {
    const response = await apiClient.post<ApiResponse<InstructorTimeOff>>(
      '/scheduling/time-off',
      data
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
      `/scheduling/time-off/${id}`,
      data
    );
    return response.data.data!;
  },

  /**
   * Delete a time off request
   */
  async deleteTimeOff(id: string): Promise<void> {
    await apiClient.delete(`/scheduling/time-off/${id}`);
  },

  // ===================================================================
  // SCHEDULING SETTINGS
  // ===================================================================

  /**
   * Get scheduling settings for the tenant
   */
  async getSchedulingSettings(): Promise<SchedulingSettings> {
    const response = await apiClient.get<ApiResponse<SchedulingSettings>>(
      '/scheduling/settings'
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
      '/scheduling/settings',
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
      '/scheduling/find-slots',
      request
    );
    return response.data.data || [];
  },

  /**
   * Check for scheduling conflicts
   */
  async checkConflicts(request: CheckConflictsRequest): Promise<SchedulingConflict[]> {
    const response = await apiClient.post<ApiResponse<SchedulingConflict[]>>(
      '/scheduling/check-conflicts',
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
    >('/scheduling/validate-booking', request);
    return response.data.data || { valid: false, conflicts: [] };
  },
};
