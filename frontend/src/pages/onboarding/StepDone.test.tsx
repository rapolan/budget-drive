import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StepDone } from './StepDone';
import { dashboardApi } from '@/api';

vi.mock('@/api', () => ({
  dashboardApi: { getGettingStartedCounts: vi.fn() },
}));

afterEach(cleanup);

function renderComponent(
  onGoToDashboard: () => void,
  props: { isSaving?: boolean; saveError?: string | null } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <StepDone onGoToDashboard={onGoToDashboard} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('StepDone', () => {
  beforeEach(() => {
    vi.mocked(dashboardApi.getGettingStartedCounts).mockResolvedValue({
      success: true,
      data: { instructorCount: 0, vehicleCount: 0, studentCount: 0, lessonCount: 0 },
    });
  });

  it('renders the checklist and calls onGoToDashboard when clicked - does not call onboardingApi itself', async () => {
    const onGoToDashboard = vi.fn();

    renderComponent(onGoToDashboard);

    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));

    expect(onGoToDashboard).toHaveBeenCalledTimes(1);
  });

  it('shows the passed-through save error and does not hide the button', () => {
    renderComponent(vi.fn(), { saveError: "Couldn't save. Try again." });

    expect(screen.getByText("Couldn't save. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeEnabled();
  });

  it('shows a loading state on the button while isSaving is true', () => {
    renderComponent(vi.fn(), { isSaving: true });

    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeDisabled();
  });
});
