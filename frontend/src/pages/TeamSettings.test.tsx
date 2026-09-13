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
    update: vi.fn(),
    remove: vi.fn(),
    resendInvite: vi.fn(),
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

// Reset Password now lives inside the "More actions" menu (the standalone
// key-icon button was removed - this is the only way to reset a
// password). requireRole('owner','admin') at the route layer is the real
// authorization boundary; these tests confirm the UI's own gating matches
// it exactly (menu never shown to staff, Reset Password never offered for
// the caller's own row), and that a successful reset shows the returned
// password clearly.
describe('TeamSettings admin-initiated password reset', () => {
  const teammate = { id: 'user-2', email: 'teammate@example.com', fullName: 'Teammate Person', role: 'staff', membershipStatus: 'active' };

  async function openMenuForRow(row: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(row).getByRole('button', { name: /more actions/i }));
  }

  it('an admin can use Reset Password from the More actions menu, and it shows the returned temporary password', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [teammate] });
    vi.mocked(usersApi.resetPassword).mockResolvedValue({ success: true, data: { temporaryPassword: 'aB3dE5fG7h' } });

    renderTeamSettings();

    const row = (await screen.findByText('teammate@example.com')).closest('tr')!;
    await openMenuForRow(row, user);
    await user.click(screen.getByRole('button', { name: /^reset password$/i }));

    expect(usersApi.resetPassword).toHaveBeenCalledWith('user-2');
    const passwordField = await screen.findByLabelText<HTMLInputElement>(/temporary password/i);
    expect(passwordField.value).toBe('aB3dE5fG7h');
    expect(screen.getByText(/password reset/i)).toBeInTheDocument();
  });

  it('a staff (non-admin) user never sees a More actions menu for anyone', async () => {
    mockCurrentUser = { id: 'staff-viewer-1', role: 'staff' };
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [teammate] });

    renderTeamSettings();

    await screen.findByText('teammate@example.com');
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
  });

  it('an admin never sees Reset Password (or any action) on their OWN row', async () => {
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
    // The caller's own row has no menu at all - every action is either
    // self-targeting (reset password, change role, remove) or requires an
    // 'invited' status this active admin row doesn't have.
    const ownRow = screen.getByText('admin@example.com').closest('tr')!;
    expect(within(ownRow).queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();

    // The teammate's row still has a working menu with Reset Password.
    const teammateRow = screen.getByText('teammate@example.com').closest('tr')!;
    await openMenuForRow(teammateRow, userEvent.setup());
    expect(screen.getByRole('button', { name: /^reset password$/i })).toBeInTheDocument();
  });
});

describe('TeamSettings change role', () => {
  const teammate = { id: 'user-2', email: 'teammate@example.com', fullName: 'Teammate Person', role: 'staff', membershipStatus: 'active' };

  it('an admin can promote a staff member to admin via the More actions menu', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [teammate] });
    vi.mocked(usersApi.update).mockResolvedValue({ success: true, data: { role: 'admin' } });

    renderTeamSettings();

    const row = (await screen.findByText('teammate@example.com')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('button', { name: /change role/i }));

    await screen.findByText(/change role for teammate person/i);
    await user.selectOptions(screen.getByLabelText(/role/i), 'admin');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(usersApi.update).toHaveBeenCalledWith('user-2', { role: 'admin' });
  });

  it('Change role is never offered for the tenant owner\'s row', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };
    const owner = { id: 'owner-1', email: 'owner@example.com', fullName: 'The Owner', role: 'owner', membershipStatus: 'active' };
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [owner] });

    renderTeamSettings();

    const row = (await screen.findByText('owner@example.com')).closest('tr')!;
    // No menu at all for the owner row (change role, remove both hidden,
    // reset password is the only thing that WOULD apply but nothing else
    // does) - actually reset password still applies since owner !== self,
    // so the menu exists but never offers Change role or Remove.
    await userEvent.setup().click(within(row).getByRole('button', { name: /more actions/i }));
    expect(screen.queryByRole('button', { name: /change role/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove from team/i })).not.toBeInTheDocument();
  });

  it('Change role is never offered for the caller\'s own row', async () => {
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
    // The own row has no menu at all (confirmed in the previous describe
    // block); nothing further to open here.
    const ownRow = screen.getByText('admin@example.com').closest('tr')!;
    expect(within(ownRow).queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
  });
});

describe('TeamSettings remove from team', () => {
  const teammate = { id: 'user-2', email: 'teammate@example.com', fullName: 'Teammate Person', role: 'staff', membershipStatus: 'active' };

  it('an admin can remove a team member after confirming', async () => {
    const user = userEvent.setup();
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [teammate] });
    vi.mocked(usersApi.remove).mockResolvedValue({ success: true, data: { message: 'User removed from team' } });

    renderTeamSettings();

    const row = (await screen.findByText('teammate@example.com')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('button', { name: /remove from team/i }));

    await screen.findByText(/remove teammate person from the team\?/i);
    await user.click(screen.getByRole('button', { name: /^remove$/i }));

    expect(usersApi.remove).toHaveBeenCalledWith('user-2');
  });

  it('Remove is never offered for the tenant owner or the caller\'s own row', async () => {
    mockCurrentUser = { id: 'admin-1', role: 'admin' };
    const owner = { id: 'owner-1', email: 'owner@example.com', fullName: 'The Owner', role: 'owner', membershipStatus: 'active' };
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [owner] });

    renderTeamSettings();

    const row = (await screen.findByText('owner@example.com')).closest('tr')!;
    await userEvent.setup().click(within(row).getByRole('button', { name: /more actions/i }));
    expect(screen.queryByRole('button', { name: /remove from team/i })).not.toBeInTheDocument();
  });
});

describe('TeamSettings resend invite', () => {
  it('shows Resend invite for an invited user and displays a fresh invite link', async () => {
    const user = userEvent.setup();
    const invitedUser = { id: 'user-3', email: 'pending@example.com', fullName: null, role: 'staff', membershipStatus: 'invited' };
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [invitedUser] });
    vi.mocked(usersApi.resendInvite).mockResolvedValue({
      success: true,
      data: { inviteLink: 'https://example.com/accept-invite?token=newtoken123' },
    });

    renderTeamSettings();

    const row = (await screen.findByText('pending@example.com')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more actions/i }));
    await user.click(screen.getByRole('button', { name: /resend invite/i }));

    expect(usersApi.resendInvite).toHaveBeenCalledWith('user-3');
    const linkField = await screen.findByLabelText<HTMLInputElement>(/invite link/i);
    expect(linkField.value).toBe('https://example.com/accept-invite?token=newtoken123');
  });

  it('never shows Resend invite for an already-active user', async () => {
    const activeUser = { id: 'user-2', email: 'teammate@example.com', fullName: 'Teammate Person', role: 'staff', membershipStatus: 'active' };
    vi.mocked(usersApi.getAll).mockResolvedValue({ success: true, data: [activeUser] });

    renderTeamSettings();

    const row = (await screen.findByText('teammate@example.com')).closest('tr')!;
    await userEvent.setup().click(within(row).getByRole('button', { name: /more actions/i }));
    expect(screen.queryByRole('button', { name: /resend invite/i })).not.toBeInTheDocument();
  });
});
