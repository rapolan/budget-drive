import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamSettings } from './TeamSettings';
import { usersApi } from '@/api/users';

vi.mock('@/api/users', () => ({
  usersApi: {
    getAll: vi.fn(),
    invite: vi.fn(),
  },
}));

function renderTeamSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamSettings />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TeamSettings invite flow', () => {
  it('shows the real inviteLink from the backend response after a successful invite, and keeps the modal open', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.invite).mockResolvedValue({
      success: true,
      data: {
        id: 'user-1',
        email: 'newteammate@example.com',
        inviteLink: 'https://budget-drive-production.up.railway.app/accept-invite?token=abc123',
      },
    });

    renderTeamSettings();

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    await user.type(screen.getByLabelText(/email address/i), 'newteammate@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    // The link shown is EXACTLY the backend's own inviteLink field - never
    // a frontend-recomputed value - and the modal stays open to show it
    // rather than closing immediately (the bug this fixes).
    const linkField = await screen.findByLabelText<HTMLInputElement>(/invite link/i);
    expect(linkField.value).toBe('https://budget-drive-production.up.railway.app/accept-invite?token=abc123');
    expect(screen.getByText(/invite created/i)).toBeInTheDocument();
    expect(screen.getByText(/newteammate@example.com/)).toBeInTheDocument();
  });

  it('copies the invite link to the clipboard when Copy is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.invite).mockResolvedValue({
      success: true,
      data: { id: 'user-1', email: 'newteammate@example.com', inviteLink: 'https://example.com/accept-invite?token=xyz' },
    });

    renderTeamSettings();

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    await user.type(screen.getByLabelText(/email address/i), 'newteammate@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    await screen.findByLabelText(/invite link/i);
    await user.click(screen.getByRole('button', { name: /copy/i }));

    // jsdom's own built-in Clipboard implementation (not a mock this test
    // controls) backs navigator.clipboard here - it resolves without
    // throwing, so copyLink's try block runs to completion and flips the
    // button to its "Copied!" state, which is the actual user-visible
    // behavior this test exists to lock in.
    expect(await screen.findByText(/copied!/i)).toBeInTheDocument();
  });

  it('shows an error message instead of silently doing nothing when the invite request fails', async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error('request failed'), {
      response: { data: { error: 'A user with this email already exists' } },
    });
    vi.mocked(usersApi.invite).mockRejectedValue(error);

    renderTeamSettings();

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    await user.type(screen.getByLabelText(/email address/i), 'taken@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    expect(await screen.findByText(/a user with this email already exists/i)).toBeInTheDocument();
    // Still the form, not the success view - no inviteLink field rendered.
    expect(screen.queryByLabelText(/invite link/i)).not.toBeInTheDocument();
  });

  it('closes the modal via Done after showing the link, without reopening the plain form', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.invite).mockResolvedValue({
      success: true,
      data: { id: 'user-1', email: 'newteammate@example.com', inviteLink: 'https://example.com/accept-invite?token=xyz' },
    });

    renderTeamSettings();

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    await user.type(screen.getByLabelText(/email address/i), 'newteammate@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    await screen.findByLabelText(/invite link/i);
    await user.click(screen.getByRole('button', { name: /done/i }));

    await waitFor(() => {
      expect(screen.queryByText(/invite created/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /send invite/i })).not.toBeInTheDocument();
    });
  });
});
