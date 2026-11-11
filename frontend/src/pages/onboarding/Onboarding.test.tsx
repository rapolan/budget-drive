import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingWizardPage } from './Onboarding';
import { onboardingApi, dashboardApi } from '@/api';
import type { TenantSettings } from '@/types';

vi.mock('@/api', () => ({
  onboardingApi: { complete: vi.fn() },
  dashboardApi: { getGettingStartedCounts: vi.fn() },
  tenantsApi: { updateSettings: vi.fn() },
  schedulingApi: { updateSchedulingSettings: vi.fn() },
  instructorsApi: { create: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockRefreshSettings = vi.fn();
let mockSettings: Partial<TenantSettings> | null = null;
let mockLoading = false;

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ settings: mockSettings, loading: mockLoading, refreshSettings: mockRefreshSettings }),
}));

afterEach(cleanup);

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingWizardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OnboardingWizardPage - resume step resolution', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockRefreshSettings.mockReset();
    mockLoading = false;
  });

  it('starts at step 1 when settings are empty', async () => {
    mockSettings = {};
    renderWizard();
    await waitFor(() => expect(screen.getByRole('heading', { name: /school details/i })).toBeInTheDocument());
  });

  it('resumes at step 5 (Done) when onboardingCompletedAt is already set', async () => {
    mockSettings = { onboardingCompletedAt: '2026-01-01T00:00:00Z' };
    vi.mocked(dashboardApi.getGettingStartedCounts).mockResolvedValue({
      success: true,
      data: { instructorCount: 0, vehicleCount: 0, studentCount: 0, lessonCount: 0 },
    });
    renderWizard();
    await waitFor(() => expect(screen.getByText(/you're all set/i)).toBeInTheDocument());
  });
});

describe('OnboardingWizardPage - finish later / go to dashboard', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockRefreshSettings.mockReset();
    mockLoading = false;
    mockSettings = {
      onboardingCompletedAt: null,
      supportPhone: '555-0000',
      addressLine1: '1 Main St',
      enableDriverEducation: false,
      defaultLessonCost: 50,
      standardLessonLengthMinutes: 60,
    };
  });

  it('calls onboardingApi.complete() then refreshSettings() BEFORE navigating, so stale settings never bounce the user back into the wizard', async () => {
    const callOrder: string[] = [];
    vi.mocked(onboardingApi.complete).mockImplementation(async () => {
      callOrder.push('complete');
      return { success: true, data: null };
    });
    mockRefreshSettings.mockImplementation(async () => {
      callOrder.push('refreshSettings');
    });

    renderWizard();
    await waitFor(() => expect(screen.getByText(/finish later/i)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/finish later/i));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(callOrder).toEqual(['complete', 'refreshSettings']);
    // refreshSettings must resolve before navigate fires.
    const navigateCallIndex = mockNavigate.mock.invocationCallOrder[0];
    expect(navigateCallIndex).toBeGreaterThan(0);
  });

  it('still navigates even if onboardingApi.complete() rejects (non-blocking)', async () => {
    vi.mocked(onboardingApi.complete).mockRejectedValue(new Error('network error'));
    mockRefreshSettings.mockResolvedValue(undefined);

    renderWizard();
    await waitFor(() => expect(screen.getByText(/finish later/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/finish later/i));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(mockRefreshSettings).toHaveBeenCalled();
  });
});
