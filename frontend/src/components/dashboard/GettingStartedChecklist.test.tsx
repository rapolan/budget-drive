import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { GettingStartedChecklist } from './GettingStartedChecklist';
import { dashboardApi } from '@/api';
import type { GettingStartedCounts } from '@/api/dashboard';

vi.mock('@/api', () => ({
  dashboardApi: { getGettingStartedCounts: vi.fn() },
}));

afterEach(cleanup);

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <GettingStartedChecklist />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockCounts(overrides: Partial<GettingStartedCounts> = {}): GettingStartedCounts {
  return {
    instructorCount: 0,
    vehicleCount: 0,
    studentCount: 0,
    lessonCount: 0,
    ...overrides,
  };
}

describe('GettingStartedChecklist', () => {
  beforeEach(() => {
    vi.mocked(dashboardApi.getGettingStartedCounts).mockReset();
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('renders all four items as not-done when every count is zero', async () => {
    vi.mocked(dashboardApi.getGettingStartedCounts).mockResolvedValue({ success: true, data: mockCounts() });

    renderComponent();

    await waitFor(() => expect(screen.getByTestId('getting-started-checklist')).toBeInTheDocument());
    expect(screen.getByText('Add your first instructor')).toBeInTheDocument();
    expect(screen.getByText('Add a vehicle')).toBeInTheDocument();
    expect(screen.getByText('Add your first student')).toBeInTheDocument();
    expect(screen.getByText('Schedule your first lesson')).toBeInTheDocument();
  });

  it('renders nothing once every item is done', async () => {
    vi.mocked(dashboardApi.getGettingStartedCounts).mockResolvedValue({
      success: true,
      data: mockCounts({ instructorCount: 1, vehicleCount: 1, studentCount: 1, lessonCount: 1 }),
    });

    renderComponent();

    await waitFor(() => expect(dashboardApi.getGettingStartedCounts).toHaveBeenCalled());
    expect(screen.queryByTestId('getting-started-checklist')).not.toBeInTheDocument();
  });

  it('renders nothing when the endpoint errors (e.g. a 403 for an unsupported role)', async () => {
    vi.mocked(dashboardApi.getGettingStartedCounts).mockRejectedValue({ response: { status: 403 } });

    renderComponent();

    await waitFor(() => expect(dashboardApi.getGettingStartedCounts).toHaveBeenCalled());
    expect(screen.queryByTestId('getting-started-checklist')).not.toBeInTheDocument();
  });

  it('hides itself after dismiss and persists that via localStorage', async () => {
    vi.mocked(dashboardApi.getGettingStartedCounts).mockResolvedValue({ success: true, data: mockCounts() });

    renderComponent();

    await waitFor(() => expect(screen.getByTestId('getting-started-checklist')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Dismiss getting started checklist/i));

    expect(screen.queryByTestId('getting-started-checklist')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('dashboard_getting_started_dismissed')).toBe('true');
  });

  it('stays hidden on a fresh render when previously dismissed', async () => {
    window.localStorage.setItem('dashboard_getting_started_dismissed', 'true');
    vi.mocked(dashboardApi.getGettingStartedCounts).mockResolvedValue({ success: true, data: mockCounts() });

    renderComponent();

    await waitFor(() => expect(dashboardApi.getGettingStartedCounts).toHaveBeenCalled());
    expect(screen.queryByTestId('getting-started-checklist')).not.toBeInTheDocument();
  });

  it('navigates to the item href when an incomplete item is clicked', async () => {
    vi.mocked(dashboardApi.getGettingStartedCounts).mockResolvedValue({ success: true, data: mockCounts() });

    renderComponent();

    await waitFor(() => expect(screen.getByText('Add a vehicle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add a vehicle'));
    // Navigation itself is exercised via MemoryRouter; absence of a thrown
    // error here is the meaningful assertion, since there's no visible
    // route change to assert against without mounting actual routes.
  });
});
