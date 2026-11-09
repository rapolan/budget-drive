import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { GoogleCalendarSync } from './GoogleCalendarSync';
import { googleCalendarApi } from '@/api';
import type { GoogleCalendarStatus } from '@/api/googleCalendar';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    googleCalendarApi: {
      getStatus: vi.fn(),
      getConsentUrl: vi.fn(),
      disconnect: vi.fn(),
      resync: vi.fn(),
    },
  };
});

afterEach(cleanup);

const INSTRUCTOR_ID = 'instructor-1';

function renderComponent(initialEntry = '/profile') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <GoogleCalendarSync instructorId={INSTRUCTOR_ID} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockStatus(overrides: Partial<GoogleCalendarStatus> = {}): GoogleCalendarStatus {
  return {
    connected: false,
    lastSyncAt: null,
    lastSyncError: null,
    reconnectRequired: false,
    ...overrides,
  };
}

describe('GoogleCalendarSync - not connected', () => {
  it('shows a Connect button and the one-directional/overwrite copy', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(mockStatus());

    renderComponent();

    await waitFor(() => expect(screen.getByText(/Connect Google Calendar/i)).toBeInTheDocument());
    expect(screen.getByText(/always the source of truth/i)).toBeInTheDocument();
  });

  it('navigates the browser to the consent URL when Connect is clicked', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(mockStatus());
    vi.mocked(googleCalendarApi.getConsentUrl).mockResolvedValue('https://accounts.google.com/consent');

    const originalLocation = window.location;
    // @ts-expect-error - replacing window.location for this test only
    delete window.location;
    // @ts-expect-error - minimal stub sufficient for asserting href assignment
    window.location = { href: '' };

    renderComponent();
    await waitFor(() => expect(screen.getByText(/Connect Google Calendar/i)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Connect Google Calendar/i));

    await waitFor(() => expect(window.location.href).toBe('https://accounts.google.com/consent'));

    // @ts-expect-error - restoring the real Location object stubbed out above
    window.location = originalLocation;
  });
});

describe('GoogleCalendarSync - connected', () => {
  it('shows the Connected badge and Resync/Disconnect actions', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(
      mockStatus({ connected: true, lastSyncAt: '2026-11-01T12:00:00.000Z' })
    );

    renderComponent();

    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
    expect(screen.getByText(/Resync now/i)).toBeInTheDocument();
    expect(screen.getByText(/Disconnect/i)).toBeInTheDocument();
  });

  it('does not claim automatic retry when a lesson sync has failed - only mentions the Resync now action', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(
      mockStatus({ connected: true, lastSyncError: 'some lesson failed to sync' })
    );

    renderComponent();

    await waitFor(() => expect(screen.getByText(/Last sync for one or more lessons failed/i)).toBeInTheDocument());
    const failureCopy = screen.getByText(/Last sync for one or more lessons failed/i).textContent || '';
    expect(failureCopy).not.toMatch(/automatically retried/i);
    expect(failureCopy).toMatch(/retried automatically only if it changes again/i);
  });

  it('calls resync and shows a completion message', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(mockStatus({ connected: true }));
    vi.mocked(googleCalendarApi.resync).mockResolvedValue(undefined);

    renderComponent();
    await waitFor(() => expect(screen.getByText(/Resync now/i)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Resync now/i));

    await waitFor(() => expect(googleCalendarApi.resync).toHaveBeenCalledWith(INSTRUCTOR_ID));
    await waitFor(() => expect(screen.getByText(/Resync complete/i)).toBeInTheDocument());
  });

  it('calls disconnect when Disconnect is clicked', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(mockStatus({ connected: true }));
    vi.mocked(googleCalendarApi.disconnect).mockResolvedValue(undefined);

    renderComponent();
    await waitFor(() => expect(screen.getByText(/Disconnect/i)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Disconnect/i));

    await waitFor(() => expect(googleCalendarApi.disconnect).toHaveBeenCalledWith(INSTRUCTOR_ID));
  });
});

describe('GoogleCalendarSync - reconnect required', () => {
  it('shows the reconnect-needed badge and a Reconnect action instead of Resync', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(
      mockStatus({ connected: true, reconnectRequired: true, lastSyncError: 'reconnect_required' })
    );

    renderComponent();

    await waitFor(() => expect(screen.getByText('Reconnect needed')).toBeInTheDocument());
    expect(screen.getByText(/^Reconnect$/i)).toBeInTheDocument();
    expect(screen.queryByText(/Resync now/i)).not.toBeInTheDocument();
  });
});

describe('GoogleCalendarSync - OAuth callback redirect banners', () => {
  it('shows a denied message and strips the query param', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(mockStatus());

    renderComponent('/profile?googleCalendar=denied');

    await waitFor(() => expect(screen.getByText(/Google sign-in was cancelled/i)).toBeInTheDocument());
  });

  it('shows an error message on a failed callback', async () => {
    vi.mocked(googleCalendarApi.getStatus).mockResolvedValue(mockStatus());

    renderComponent('/profile?googleCalendar=error');

    await waitFor(() => expect(screen.getByText(/Something went wrong connecting/i)).toBeInTheDocument());
  });
});
