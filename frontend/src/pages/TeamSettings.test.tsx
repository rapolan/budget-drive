import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamSettings } from './TeamSettings';
import { usersApi } from '@/api/users';

vi.mock('@/api/users', () => ({
  usersApi: {
    getAll: vi.fn(),
    invite: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

// Mutable per-test so the "staff can't see Reset Password" test can swap
// in a staff-role user without a separate mock setup per test file.
let mockCurrentUser: { id: string; role: string } = { id: 'admin-1', role: 'admin' };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockCurrentUser }),
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
  mockCurrentUser = { id: 'admin-1', role: 'admin' };
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

// An invited-but-not-yet-accepted teammate has fullName: null (migration
// 002 - they haven't chosen a name yet, that only happens at accept-
// invite). Confirms the team list's existing null-safe fallbacks
// (studentAge-style ternaries already in the JSX, not new code) actually
// render correctly rather than throwing or showing literal "null".
describe('TeamSettings member list with an invited (nameless) teammate', () => {
  it('shows "Pending User" and an email-initial avatar for a team member with no fullName yet', async () => {
    vi.mocked(usersApi.getAll).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'user-2',
          email: 'pending@example.com',
          fullName: null,
          role: 'staff',
          membershipStatus: 'invited',
        },
      ],
    });

    renderTeamSettings();

    expect(await screen.findByText('Pending User')).toBeInTheDocument();
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    // Avatar initial falls back to the email's first letter when fullName
    // is null ('p' from pending@example.com, uppercased).
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('invited')).toBeInTheDocument();
  });
});

// INTERIM admin-initiated password reset (no email delivery) - see
// resetUserPassword's doc comment in userService.ts for the full
// rationale. requireRole('owner','admin') at the route layer is the real
// authorization boundary; these tests confirm the UI's own gating
// matches it exactly (never shown to staff, never for the caller's own
// row), and that a successful reset shows the returned password clearly.
describe('TeamSettings admin-initiated password reset', () => {
  const teammate = { id: 'user-2', email: 'teammate@example.com', fullName: 'Teammate Person', role: 'staff', membershipStatus: 'active' };

  it('an admin sees and can use Reset Password for another team member, and it shows the returned temporary password', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [teammate] });
    vi.mocked(usersApi.resetPassword).mockResolvedValue({ success: true, data: { temporaryPassword: 'aB3dE5fG7h' } });

    renderTeamSettings();

    const row = (await screen.findByText('teammate@example.com')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /reset password/i }));

    expect(usersApi.resetPassword).toHaveBeenCalledWith('user-2');
    const passwordField = await screen.findByLabelText<HTMLInputElement>(/temporary password/i);
    expect(passwordField.value).toBe('aB3dE5fG7h');
    expect(screen.getByText(/password reset/i)).toBeInTheDocument();
  });

  it('a staff (non-admin) user never sees a Reset Password button for anyone', async () => {
    mockCurrentUser = { id: 'staff-viewer-1', role: 'staff' };
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [teammate] });

    renderTeamSettings();

    await screen.findByText('teammate@example.com');
    expect(screen.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument();
  });

  it('an admin never sees a Reset Password button on their OWN row', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };
    vi.mocked(usersApi.getAll).mockResolvedValue({
      success: true,
      data: [
        { id: 'admin-1', email: 'admin@example.com', fullName: 'Current Admin', role: 'admin', membershipStatus: 'active' },
        teammate,
      ],
    });

    renderTeamSettings();

    await screen.findByText('admin@example.com');
    // Exactly one Reset Password button - for the teammate, not the
    // caller's own row.
    expect(screen.getAllByRole('button', { name: /reset password/i })).toHaveLength(1);
    const ownRow = screen.getByText('admin@example.com').closest('tr')!;
    expect(within(ownRow).queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument();
  });
});
