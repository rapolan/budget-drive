import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface DeCohortSession {
  id: string;
  tenantId: string;
  cohortId: string;
  curriculumDay: 1 | 2 | 3 | 4;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

export interface DeCohort {
  id: string;
  tenantId: string;
  name: string;
  teacherInstructorId: string | null;
  capacity: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  sessions: DeCohortSession[];
  enrolledCount: number;
}

export interface CreateCohortSessionInput {
  curriculumDay: 1 | 2 | 3 | 4;
  sessionDate: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
}

export interface CreateCohortInput {
  name: string;
  teacherInstructorId?: string | null;
  capacity: number;
  sessions: CreateCohortSessionInput[];
}

export interface UpdateCohortInput {
  name?: string;
  teacherInstructorId?: string | null;
  capacity?: number;
  status?: 'scheduled' | 'completed' | 'cancelled';
}

export interface CohortGapEntry {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  missingCurriculumDays: number[];
}

export interface RecordAttendanceInput {
  enrollmentId: string;
  present: boolean;
}

export interface CohortRosterSession {
  id: string;
  curriculumDay: 1 | 2 | 3 | 4;
  sessionDate: string;
}

export interface CohortRosterStudent {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  // Keyed by session id (one of this cohort's 4 sessions).
  attendance: Record<string, { present: boolean; isHomeCohort: boolean }>;
  // Cohort-agnostic: counts every attended curriculum day across ALL of
  // this student's attendance, not just this cohort's sessions.
  attendedCurriculumDayCount: number;
  missingCurriculumDays: number[];
}

export interface CohortRoster {
  sessions: CohortRosterSession[];
  students: CohortRosterStudent[];
}

export interface MakeUpCandidate {
  enrollmentId: string;
  studentId: string;
  studentName: string;
}

export const classroomApi = {
  createCohort: async (data: CreateCohortInput) => {
    const response = await apiClient.post<ApiResponse<DeCohort>>('/classroom/cohorts', data);
    return response.data;
  },

  getCohorts: async () => {
    const response = await apiClient.get<ApiResponse<DeCohort[]>>('/classroom/cohorts');
    return response.data;
  },

  getCohortById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<DeCohort>>(`/classroom/cohorts/${id}`);
    return response.data;
  },

  updateCohort: async (id: string, data: UpdateCohortInput) => {
    const response = await apiClient.patch<ApiResponse<DeCohort>>(`/classroom/cohorts/${id}`, data);
    return response.data;
  },

  getCohortAttendanceGaps: async (id: string) => {
    const response = await apiClient.get<ApiResponse<CohortGapEntry[]>>(`/classroom/cohorts/${id}/gaps`);
    return response.data;
  },

  joinCohort: async (id: string, enrollmentId: string) => {
    const response = await apiClient.post<ApiResponse<{ id: string; cohortId: string; enrollmentId: string }>>(
      `/classroom/cohorts/${id}/join`,
      { enrollmentId }
    );
    return response.data;
  },

  getCohortRoster: async (cohortId: string) => {
    const response = await apiClient.get<ApiResponse<CohortRoster>>(`/classroom/cohorts/${cohortId}/roster`);
    return response.data;
  },

  recordAttendance: async (sessionId: string, data: RecordAttendanceInput) => {
    const response = await apiClient.post<ApiResponse<void>>(`/classroom/sessions/${sessionId}/attendance`, data);
    return response.data;
  },

  searchMakeUpCandidates: async (search: string, excludeEnrollmentIds: string[]) => {
    const response = await apiClient.get<ApiResponse<MakeUpCandidate[]>>('/classroom/make-up-candidates', {
      params: { q: search, excludeEnrollmentIds: excludeEnrollmentIds.join(',') },
    });
    return response.data;
  },
};
