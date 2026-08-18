import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SetupStep } from '../SetupStep';
import type { Student } from '@/types';

vi.mock('@/api', () => ({
  feeFlagsApi: {
    getOutstandingForStudent: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

afterEach(cleanup);

function renderSetupStep(props: React.ComponentProps<typeof SetupStep>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SetupStep {...props} />
    </QueryClientProvider>
  );
}

const STUDENT: Student = {
  id: 'student-1',
  tenantId: 'tenant-1',
  fullName: 'Aisha Williams',
  email: 'aisha@example.com',
  status: 'active',
  enrollmentDate: new Date('2026-01-01'),
  totalHoursCompleted: 10,
} as Student;

const DATE_PRESETS = {
  next2Weeks: { start: '2026-08-04', end: '2026-08-17' },
  thisMonth: { start: '2026-08-01', end: '2026-08-31' },
  nextMonth: { start: '2026-09-01', end: '2026-09-30' },
};

function baseProps(overrides: Partial<React.ComponentProps<typeof SetupStep>> = {}) {
  return {
    preselectedStudent: STUDENT,
    selectedStudent: STUDENT,
    selectedStudentId: STUDENT.id,
    setSelectedStudentId: vi.fn(),
    students: [STUDENT],
    studentSearch: '',
    setStudentSearch: vi.fn(),
    showStudentDropdown: false,
    setShowStudentDropdown: vi.fn(),
    pickupAddress: '123 Main St',
    setPickupAddress: vi.fn(),
    pickupZip: '90008',
    setPickupZip: vi.fn(),
    lessonType: 'behind_wheel' as const,
    setLessonType: vi.fn(),
    duration: 120,
    setDuration: vi.fn(),
    timePreference: 'any' as const,
    setTimePreference: vi.fn(),
    datePresets: DATE_PRESETS,
    datePreset: 'next2Weeks' as const,
    setDatePreset: vi.fn(),
    searchStartDate: DATE_PRESETS.next2Weeks.start,
    setSearchStartDate: vi.fn(),
    searchEndDate: DATE_PRESETS.next2Weeks.end,
    setSearchEndDate: vi.fn(),
    loading: false,
    onFindSlots: vi.fn(),
    ...overrides,
  };
}

describe('SetupStep - Search Dates control', () => {
  it('renders all three preset chips and the From/To inputs populated from props', () => {
    renderSetupStep(baseProps());

    expect(screen.getByRole('button', { name: 'Next 2 Weeks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This Month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next Month' })).toBeInTheDocument();

    const fromInput = screen.getByLabelText('From') as HTMLInputElement;
    const toInput = screen.getByLabelText('To') as HTMLInputElement;
    expect(fromInput.value).toBe(DATE_PRESETS.next2Weeks.start);
    expect(toInput.value).toBe(DATE_PRESETS.next2Weeks.end);
  });

  it('clicking a preset chip calls setDatePreset with that preset key', () => {
    const setDatePreset = vi.fn();
    renderSetupStep(baseProps({ setDatePreset }));

    fireEvent.click(screen.getByRole('button', { name: 'This Month' }));

    expect(setDatePreset).toHaveBeenCalledWith('thisMonth');
  });

  it('editing the From input updates searchStartDate and flips the preset to custom', () => {
    const setSearchStartDate = vi.fn();
    const setDatePreset = vi.fn();
    renderSetupStep(baseProps({ setSearchStartDate, setDatePreset }));

    const fromInput = screen.getByLabelText('From');
    fireEvent.change(fromInput, { target: { value: '2026-08-10' } });

    expect(setSearchStartDate).toHaveBeenCalledWith('2026-08-10');
    expect(setDatePreset).toHaveBeenCalledWith('custom');
  });

  it('editing the To input updates searchEndDate and flips the preset to custom', () => {
    const setSearchEndDate = vi.fn();
    const setDatePreset = vi.fn();
    renderSetupStep(baseProps({ setSearchEndDate, setDatePreset }));

    const toInput = screen.getByLabelText('To');
    fireEvent.change(toInput, { target: { value: '2026-08-20' } });

    expect(setSearchEndDate).toHaveBeenCalledWith('2026-08-20');
    expect(setDatePreset).toHaveBeenCalledWith('custom');
  });

  it('the active preset chip is visually distinguished from the others', () => {
    renderSetupStep(baseProps({ datePreset: 'nextMonth' }));

    const nextMonthChip = screen.getByRole('button', { name: 'Next Month' });
    const thisMonthChip = screen.getByRole('button', { name: 'This Month' });
    expect(nextMonthChip.className).toContain('bg-primary');
    expect(thisMonthChip.className).not.toContain('bg-primary text-white');
  });

  it('disables the preset chips while datePresets has not loaded yet', () => {
    renderSetupStep(baseProps({ datePresets: undefined }));

    expect(screen.getByRole('button', { name: 'Next 2 Weeks' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'This Month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next Month' })).toBeDisabled();
  });
});
