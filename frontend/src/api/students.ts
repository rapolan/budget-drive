import { apiClient } from './client';
import type {
  Student,
  Guardian,
  StudentGuardianLink,
  CreateStudentInput,
  CreateStudentWithGuardianInput,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

// Archive (Phase 4 of docs/compliance-records-build-plan.md) - mirrors
// backend studentService's ArchiveReadyEntry/HeldStudentEntry/
// ArchivedStudentEntry exactly.
export interface ArchiveReadyEntry {
  studentId: string;
  studentName: string;
  reason: 'permit_expired' | 'inactivity' | 'de_year_end';
  reasonDate: string;
  programTypes: Array<'driver_training' | 'driver_education'>;
}

export interface HeldStudentEntry {
  studentId: string;
  studentName: string;
  archiveHoldReason: string | null;
  archiveHeldAt: string | null;
  archiveHeldByName: string | null;
}

export interface ArchivedStudentEntry {
  studentId: string;
  studentName: string;
  archivedAt: string;
  archiveHash: string | null;
  archiveLedgerTxid: string | null;
  programTypes: Array<'driver_training' | 'driver_education'>;
}

export const studentsApi = {
  getAll: async (page = 1, limit = 50) => {
    const response = await apiClient.get<PaginatedResponse<Student>>(
      `/students?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<ApiResponse<Student>>(`/students/${id}`);
    return response.data;
  },

  create: async (data: CreateStudentInput) => {
    const response = await apiClient.post<ApiResponse<Student>>('/students', data);
    return response.data;
  },

  // Atomically creates a student and creates-or-links one or more guardians
  // in one transaction (backend: POST /students/with-guardian). Use this
  // instead of `create` whenever any guardian is being linked at creation
  // time - never call `create` followed by separate guardian-link requests,
  // even for multiple guardians (that would open N transactions instead
  // of one).
  createWithGuardian: async (data: CreateStudentWithGuardianInput) => {
    const response = await apiClient.post<
      ApiResponse<{ student: Student; guardians: Array<{ guardian: Guardian; link: StudentGuardianLink }> }>
    >('/students/with-guardian', data);
    return response.data;
  },

  update: async (id: string, data: Partial<CreateStudentInput>) => {
    const response = await apiClient.put<ApiResponse<Student>>(`/students/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/students/${id}`);
    return response.data;
  },

  getByStatus: async (status: 'active' | 'completed' | 'dropped' | 'suspended') => {
    const response = await apiClient.get<ApiResponse<Student[]>>(`/students/status/${status}`);
    return response.data;
  },

  // Archive (Phase 4) - eligibility worklist, live-computed on every call,
  // never a background sweep. Sealing itself is always an explicit action
  // (archive/archiveEarly below).
  getArchiveWorklist: async () => {
    const response = await apiClient.get<ApiResponse<ArchiveReadyEntry[]>>('/students/archive-worklist');
    return response.data;
  },

  // Students currently held out of the worklist - reviewed here rather
  // than left to silently accumulate (holds have no auto-expiry).
  getHeldStudents: async () => {
    const response = await apiClient.get<ApiResponse<HeldStudentEntry[]>>('/students/archive-held');
    return response.data;
  },

  // The sealed archive, newest-first - year/month grouping happens
  // client-side in Archive.tsx.
  getArchived: async () => {
    const response = await apiClient.get<ApiResponse<ArchivedStudentEntry[]>>('/students/archive');
    return response.data;
  },

  // Seals a student's record - used by the worklist's per-row action, the
  // bulk "Archive all eligible" action, and manual "Archive early" alike.
  archive: async (id: string) => {
    const response = await apiClient.post<ApiResponse<Student>>(`/students/${id}/archive`);
    return response.data;
  },

  archiveHold: async (id: string, reason: string) => {
    const response = await apiClient.post<ApiResponse<void>>(`/students/${id}/archive-hold`, { reason });
    return response.data;
  },

  clearArchiveHold: async (id: string) => {
    const response = await apiClient.post<ApiResponse<void>>(`/students/${id}/archive-hold/clear`);
    return response.data;
  },

  // Confirm-guarded on the frontend - reverses a seal. Leaves
  // archiveHash/archiveLedgerTxid in place as a historical record.
  restore: async (id: string) => {
    const response = await apiClient.post<ApiResponse<Student>>(`/students/${id}/restore`);
    return response.data;
  },
};
