import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstructorMyStudentsPage } from './MyStudents';
import { studentsApi } from '@/api';
import type { Student } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      getByInstructor: vi.fn(),
    },
  };
});

const INSTRUCTOR_ID = 'instructor-self-1';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'instructor', instructorId: INSTRUCTOR_ID } }),
}));

afterEach(cleanup);

function student(overrides: Partial<Student>): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstructorMyStudentsPage />
    </QueryClientProvider>
  );
}

describe('InstructorMyStudentsPage', () => {
  it('fetches the Active tab by default, scoped to this instructor, no history flag', async () => {
    (studentsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [student({ id: 's1', fullName: 'Active Student' })],
    });

    renderPage();

    await waitFor(() => {
      expect(studentsApi.getByInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID, { includeHistory: false });
      expect(screen.getByText('Active Student')).toBeInTheDocument();
    });
  });

  it('switching to the History tab refetches with includeHistory: true', async () => {
    (studentsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderPage();

    await waitFor(() => {
      expect(studentsApi.getByInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID, { includeHistory: false });
    });

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    await waitFor(() => {
      expect(studentsApi.getByInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID, { includeHistory: true });
    });
  });

  it('never renders payment/balance fields, even if present on the object (defense in depth for the frontend, backend already strips it)', async () => {
    (studentsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        student({
          id: 's1',
          fullName: 'Money Student',
          // Backend strips these for an instructor caller - simulate a
          // regression where they leaked through, and confirm the page
          // still never renders a dollar figure anywhere.
          paymentSummary: { totalPaid: 500, outstandingBalance: 100, paymentStatus: 'partial' },
          hasOutstandingFee: true,
          outstandingFeeAmount: 50,
        } as Partial<Student>),
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Money Student')).toBeInTheDocument();
    });

    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
    expect(screen.queryByText(/outstanding/i)).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no active students', async () => {
    (studentsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no active students/i)).toBeInTheDocument();
    });
  });
});
