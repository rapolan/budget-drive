import { apiClient } from './client';
import { ApiResponse } from '@/types';

/**
 * Recurring Lesson Patterns API
 * Phase 4C - Recurring Lessons
 */

export interface RecurringPattern {
  id: string;
  tenantId: string;
  patternName: string;
  description?: string;
  studentId: string;
  instructorId: string;
  vehicleId: string;
  lessonType: 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
  duration: number;
  cost: number;
  recurrenceType: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: number[]; // [1,3,5] for Mon, Wed, Fri
  timeOfDay: string; // HH:MM format
  startDate: string;
  endDate?: string;
  maxOccurrences?: number;
  isActive: boolean;
  packageId?: string;
  deductFromPackage: boolean;
  createdAt: string;
  updatedAt: string;
  // Join fields from view
  studentName?: string;
  instructorName?: string;
  vehicleName?: string;
  totalOccurrences?: number;
  completedOccurrences?: number;
}

export interface CreatePatternInput {
  patternName: string;
  description?: string;
  studentId: string;
  instructorId: string;
  vehicleId: string;
  lessonType?: 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
  duration: number;
  cost: number;
  recurrenceType: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: number[];
  timeOfDay: string;
  startDate: string;
  endDate?: string;
  maxOccurrences?: number;
  packageId?: string;
  deductFromPackage?: boolean;
}

export interface PatternException {
  id: string;
  patternId: string;
  exceptionDate: string;
  reason?: string;
  createdAt: string;
}

export interface GeneratedLesson {
  id: string;
  patternId: string;
  lessonId: string;
  occurrenceNumber: number;
  scheduledDate: string;
  wasModified: boolean;
  isException: boolean;
}

export interface GenerateLessonsResult {
  pattern_id: string;
  lessons_generated: number;
  lessons: any[];
}

export const patternsApi = {
  /**
   * Get all recurring patterns for tenant
   */
  async getPatterns(): Promise<RecurringPattern[]> {
    const response = await apiClient.get<ApiResponse<RecurringPattern[]>>('/patterns');
    return response.data.data || [];
  },

  /**
   * Get a specific pattern by ID
   */
  async getPattern(id: string): Promise<RecurringPattern> {
    const response = await apiClient.get<ApiResponse<RecurringPattern>>(`/patterns/${id}`);
    return response.data.data!;
  },

  /**
   * Create a new recurring pattern
   */
  async createPattern(data: CreatePatternInput): Promise<RecurringPattern> {
    const response = await apiClient.post<ApiResponse<RecurringPattern>>('/patterns', data);
    return response.data.data!;
  },

  /**
   * Update an existing pattern
   */
  async updatePattern(id: string, data: Partial<CreatePatternInput>): Promise<RecurringPattern> {
    const response = await apiClient.put<ApiResponse<RecurringPattern>>(`/patterns/${id}`, data);
    return response.data.data!;
  },

  /**
   * Delete (deactivate) a pattern
   */
  async deletePattern(id: string): Promise<void> {
    await apiClient.delete(`/patterns/${id}`);
  },

  /**
   * Generate lessons from a pattern
   */
  async generateLessons(id: string): Promise<GenerateLessonsResult> {
    const response = await apiClient.post<ApiResponse<GenerateLessonsResult>>(
      `/patterns/${id}/generate`
    );
    return response.data.data!;
  },

  /**
   * Add an exception date (skip date) to a pattern
   */
  async addException(id: string, date: string, reason?: string): Promise<PatternException> {
    const response = await apiClient.post<ApiResponse<PatternException>>(
      `/patterns/${id}/exceptions`,
      { date, reason }
    );
    return response.data.data!;
  },

  /**
   * Get exceptions for a pattern
   */
  async getExceptions(id: string): Promise<PatternException[]> {
    const response = await apiClient.get<ApiResponse<PatternException[]>>(
      `/patterns/${id}/exceptions`
    );
    return response.data.data || [];
  },
};
