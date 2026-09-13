import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
import { UserPlus, MoreVertical, Shield, Clock, CheckCircle2, Copy, Check, KeyRound, UserMinus, Mail, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { useAuth } from '@/contexts/AuthContext';

export const TeamSettings: React.FC = () => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<{ id: string; label: string } | null>(null);
  const [changeRoleTarget, setChangeRoleTarget] = useState<{ id: string; label: string; role: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; label: string } | null>(null);
  const [resendInviteTarget, setResendInviteTarget] = useState<{ id: string; label: string } | null>(null);
  const { user: currentUser } = useAuth();
  // Reset Password is an owner/admin-only action (matches requireRole on
  // the backend route exactly - this is a UI convenience, not the real
  // authorization boundary) and can never target the caller's own
  // account (that's the existing authenticated "change my password"
  // flow, which needs the current password; this admin action doesn't).
  const canResetPasswords = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  // Same role check backs every "More actions" menu item - reused as-is
  // rather than inventing a second gate, matching the backend's own
  // requireRole('owner','admin') on every mutating route this menu calls.
  const canManageTeam = canResetPasswords;

  const { data: response, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => usersApi.getAll(),
  });

  const team = response?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-tx-primary">Team Management</h2>
          <p className="mt-1 text-sm text-tx-muted">
            Manage staff and instructor access to your school's dashboard.
          </p>
        </div>
        <Button onClick={() => setIsInviteModalOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-surface2 rounded-lg"></div>
          ))}
        </div>
      ) : (
        <div className="bg-surface border border-edge rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-edge">
            <thead className="bg-surface2">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-tx-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-edge">
              {team.map((user: any) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-primary font-medium text-sm">
                          {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-tx-primary">{user.fullName || 'Pending User'}</div>
                        <div className="text-sm text-tx-muted">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.membershipStatus === 'active' ? 'bg-status-success-bg text-status-success-text' :
                      user.membershipStatus === 'invited' ? 'bg-status-warning-bg text-status-warning-text' :
                      'bg-surface2 text-tx-primary'
                    }`}>
                      {user.membershipStatus === 'active' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {user.membershipStatus === 'invited' && <Clock className="w-3 h-3 mr-1" />}
                      {user.membershipStatus || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-tx-muted">
                    <div className="flex items-center capitalize">
                      {user.role === 'admin' || user.role === 'owner' ? <Shield className="w-3 h-3 mr-1 text-purple-500" /> : null}
                      {user.role}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-1">
                      {canManageTeam && (
                        <MoreActionsMenu
                          user={user}
                          currentUser={currentUser}
                          onResetPassword={() => setResetPasswordTarget({ id: user.id, label: user.fullName || user.email })}
                          onChangeRole={() => setChangeRoleTarget({ id: user.id, label: user.fullName || user.email, role: user.role })}
                          onRemove={() => setRemoveTarget({ id: user.id, label: user.fullName || user.email })}
                          onResendInvite={() => setResendInviteTarget({ id: user.id, label: user.fullName || user.email })}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {team.length === 0 && (
            <div className="p-8 text-center text-tx-muted">No team members found.</div>
          )}
        </div>
      )}

      {isInviteModalOpen && (
        <InviteModal onClose={() => setIsInviteModalOpen(false)} />
      )}

      {resetPasswordTarget && (
        <ResetPasswordModal
          userId={resetPasswordTarget.id}
          userLabel={resetPasswordTarget.label}
          onClose={() => setResetPasswordTarget(null)}
        />
      )}

      {changeRoleTarget && (
        <ChangeRoleModal
          userId={changeRoleTarget.id}
          userLabel={changeRoleTarget.label}
          currentRole={changeRoleTarget.role}
          onClose={() => setChangeRoleTarget(null)}
        />
      )}

      {removeTarget && (
        <RemoveUserModal
          userId={removeTarget.id}
          userLabel={removeTarget.label}
          onClose={() => setRemoveTarget(null)}
        />
      )}

      {resendInviteTarget && (
        <ResendInviteModal
          userId={resendInviteTarget.id}
          userLabel={resendInviteTarget.label}
          onClose={() => setResendInviteTarget(null)}
        />
      )}
    </div>
  );
};

/**
 * "More actions" dropdown for a team member row. Modeled on
 * StatusMenu.tsx's open/close/outside-click mechanics (the existing
 * pattern for this kind of menu in this codebase - there is no shared
 * dropdown primitive to reuse instead). Each item's visibility follows the
 * task's stated rules: Resend invite only for 'invited' users; Remove and
 * Change role never for the caller's own row or for the tenant's owner
 * (an admin viewing an owner's row shouldn't see options they'd be
 * blocked from using anyway, the same "don't show what you can't do"
 * pattern already used for Reset Password).
 */
const MoreActionsMenu = ({
  user,
  currentUser,
  onResetPassword,
  onChangeRole,
  onRemove,
  onResendInvite,
}: {
  user: any;
  currentUser: { id: string; role: string } | null | undefined;
  onResetPassword: () => void;
  onChangeRole: () => void;
  onRemove: () => void;
  onResendInvite: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runAndClose = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  const isSelf = user.id === currentUser?.id;
  const isOwner = user.role === 'owner';
  const isInvited = user.membershipStatus === 'invited';

  const showResetPassword = !isSelf;
  const showChangeRole = !isSelf && !isOwner;
  const showRemove = !isSelf && !isOwner;
  const showResendInvite = isInvited;

  if (!showResetPassword && !showChangeRole && !showRemove && !showResendInvite) {
    return null;
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="More actions"
        title="More actions"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(o => !o);
        }}
      >
        <MoreVertical className="h-5 w-5" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-surface rounded-lg shadow-2xl border border-edge overflow-hidden z-50">
          {showResetPassword && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runAndClose(onResetPassword); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-tx-primary hover:bg-surface2 transition-colors"
            >
              <KeyRound className="h-4 w-4" />
              Reset password
            </button>
          )}
          {showChangeRole && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runAndClose(onChangeRole); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-tx-primary hover:bg-surface2 transition-colors"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Change role
            </button>
          )}
          {showResendInvite && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runAndClose(onResendInvite); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-tx-primary hover:bg-surface2 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Resend invite
            </button>
          )}
          {showRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runAndClose(onRemove); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-status-danger-text hover:bg-status-danger-bg transition-colors"
            >
              <UserMinus className="h-4 w-4" />
              Remove from team
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ResetPasswordModal = ({
  userId,
  userLabel,
  onClose,
}: {
  userId: string;
  userLabel: string;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);

  // INTERIM measure until a real self-service "forgot password" flow (with
  // email delivery) is built - see resetUserPassword's doc comment in
  // userService.ts. No confirmation prompt is needed before the request
  // itself since nothing destructive happens until the admin actually
  // shares this password - opening the modal already required an
  // explicit click on a clearly-labeled action.
  const resetMutation = useMutation({
    mutationFn: () => usersApi.resetPassword(userId),
  });

  React.useEffect(() => {
    resetMutation.mutate();
    // Fire exactly once when the modal opens - not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const temporaryPassword = resetMutation.data?.data?.temporaryPassword;

  const copyPassword = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6">
        {resetMutation.isPending && (
          <p className="text-sm text-tx-muted">Generating a new temporary password for {userLabel}...</p>
        )}

        {resetMutation.isError && (
          <>
            <h3 className="text-lg font-bold text-tx-primary mb-2">Couldn't reset password</h3>
            <p className="text-sm text-status-danger-text mb-4">
              {(resetMutation.error as Error & { response?: { data?: { error?: string } } })?.response?.data?.error
                || 'Something went wrong. Please try again.'}
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </>
        )}

        {temporaryPassword && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="p-1.5 bg-status-success-bg border border-status-success-border rounded-md flex-shrink-0">
                <CheckCircle2 className="h-4 w-4 text-status-success-text" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-tx-primary">Password reset</h3>
                <p className="text-sm text-tx-muted mt-0.5">
                  Share this temporary password with {userLabel} - email sending isn't set up yet, so send it
                  yourself (text, call, in person). It won't be shown again after you close this.
                </p>
              </div>
            </div>

            <label htmlFor="temp-password" className="block text-sm font-medium text-tx-secondary mb-1">
              Temporary password
            </label>
            <div className="flex gap-2">
              <input
                id="temp-password"
                type="text"
                readOnly
                value={temporaryPassword}
                title="Temporary password"
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-surface2 border border-edge-strong rounded-lg font-mono text-tx-secondary truncate"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                onClick={copyPassword}
                title="Copy temporary password to clipboard"
                className={copied ? 'bg-status-success-text hover:brightness-100' : ''}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            <div className="flex justify-end mt-6">
              <Button type="button" variant="secondary" onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Change role: promote/demote between 'staff' and 'admin' (the task's
 * explicit scope - the owner role is never offered here, since this menu
 * item is hidden entirely for owner rows and updateUserMembership itself
 * refuses to assign/revoke 'owner' unless the caller is already an
 * owner). Backed by the existing PATCH /users/:id endpoint via
 * usersApi.update - no new backend call needed for this action.
 */
const ChangeRoleModal = ({
  userId,
  userLabel,
  currentRole,
  onClose,
}: {
  userId: string;
  userLabel: string;
  currentRole: string;
  onClose: () => void;
}) => {
  const [role, setRole] = useState(currentRole === 'admin' ? 'admin' : 'staff');
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: () => usersApi.update(userId, { role: role as any }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-tx-primary mb-4">Change role for {userLabel}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="change-role" className="block text-sm font-medium text-tx-secondary mb-1">Role</label>
            <select
              id="change-role"
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-edge-strong rounded-lg p-2 focus:ring-primary focus:border-primary"
              title="Select a role"
            >
              <option value="staff">Office Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {updateMutation.isError && (
            <p className="text-sm text-status-danger-text">
              {(updateMutation.error as Error & { response?: { data?: { error?: string } } })?.response?.data?.error
                || 'Failed to change role. Please try again.'}
            </p>
          )}
          <div className="flex justify-end space-x-3 mt-6">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={updateMutation.isPending} disabled={role === currentRole}>
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Remove from team: revokes access entirely (deletes the
 * user_tenant_memberships row for this tenant only - the users row itself
 * always persists, since the same user may belong to other tenants, and
 * their row must remain for audit purposes even if not). Destructive and
 * hard to reverse (the removed user loses access on their very next
 * request that touches a requireRole-gated route - see
 * requireRole.ts), so this requires an explicit confirm step, unlike
 * Reset Password which needs no extra confirmation.
 */
const RemoveUserModal = ({
  userId,
  userLabel,
  onClose,
}: {
  userId: string;
  userLabel: string;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: () => usersApi.remove(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-1.5 bg-status-danger-bg border border-status-danger-border rounded-md flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-status-danger-text" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-tx-primary">Remove {userLabel} from the team?</h3>
            <p className="text-sm text-tx-muted mt-0.5">
              They will immediately lose access to this school's data. Their user account itself is not deleted -
              only their access to this school - so they can be re-invited later if needed.
            </p>
          </div>
        </div>

        {removeMutation.isError && (
          <p className="text-sm text-status-danger-text mb-4">
            {(removeMutation.error as Error & { response?: { data?: { error?: string } } })?.response?.data?.error
              || 'Failed to remove this team member. Please try again.'}
          </p>
        )}

        <div className="flex justify-end space-x-3 mt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            loading={removeMutation.isPending}
            onClick={() => removeMutation.mutate()}
          >
            {removeMutation.isPending ? 'Removing...' : 'Remove'}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Resend invite: for a user still in 'invited' status, regenerates and
 * shows a new invite link - same copy-link UI pattern as InviteModal's
 * success state below. Backed by usersApi.resendInvite, which UPDATEs the
 * existing membership row rather than attempting a fresh INSERT (see
 * resendInvite's doc comment in userService.ts) - this is also the fix
 * for the previously-reported bug where re-inviting an already-invited
 * email 500s on the user_tenant_memberships unique constraint.
 */
const ResendInviteModal = ({
  userId,
  userLabel,
  onClose,
}: {
  userId: string;
  userLabel: string;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);

  const resendMutation = useMutation({
    mutationFn: () => usersApi.resendInvite(userId),
  });

  React.useEffect(() => {
    resendMutation.mutate();
    // Fire exactly once when the modal opens - not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inviteLink = resendMutation.data?.data?.inviteLink;

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6">
        {resendMutation.isPending && (
          <p className="text-sm text-tx-muted">Generating a new invite link for {userLabel}...</p>
        )}

        {resendMutation.isError && (
          <>
            <h3 className="text-lg font-bold text-tx-primary mb-2">Couldn't resend invite</h3>
            <p className="text-sm text-status-danger-text mb-4">
              {(resendMutation.error as Error & { response?: { data?: { error?: string } } })?.response?.data?.error
                || 'Something went wrong. Please try again.'}
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </>
        )}

        {inviteLink && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="p-1.5 bg-status-success-bg border border-status-success-border rounded-md flex-shrink-0">
                <CheckCircle2 className="h-4 w-4 text-status-success-text" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-tx-primary">Invite resent</h3>
                <p className="text-sm text-tx-muted mt-0.5">
                  Share this new link with {userLabel} - their previous invite link no longer works.
                </p>
              </div>
            </div>

            <label htmlFor="resend-invite-link" className="block text-sm font-medium text-tx-secondary mb-1">
              Invite link
            </label>
            <div className="flex gap-2">
              <input
                id="resend-invite-link"
                type="text"
                readOnly
                value={inviteLink}
                title="Invite link"
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-surface2 border border-edge-strong rounded-lg font-mono text-tx-secondary truncate"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                onClick={copyLink}
                title="Copy invite link to clipboard"
                className={copied ? 'bg-status-success-text hover:brightness-100' : ''}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            <div className="flex justify-end mt-6">
              <Button type="button" variant="secondary" onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const InviteModal = ({ onClose }: { onClose: () => void }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const queryClient = useQueryClient();
  // Automated email isn't built yet - the backend creates the invite (a
  // user row + token) and returns a real inviteLink, but nothing ever
  // sends it anywhere. Without showing it here, an admin has no way to
  // actually get the link to their teammate, so a successful invite must
  // keep the modal open and show it, not just close - see inviteLink below.
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: usersApi.invite,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      // Reuse the backend's own inviteLink verbatim - never recomputed
      // here, so this always matches whatever FRONTEND_URL the backend
      // was actually configured with (see userController.ts's
      // inviteTeamMember).
      setInviteLink(response.data?.inviteLink ?? null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    inviteMutation.mutate({ email, role: role as any });
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (inviteLink) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-1.5 bg-status-success-bg border border-status-success-border rounded-md flex-shrink-0">
              <CheckCircle2 className="h-4 w-4 text-status-success-text" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-tx-primary">Invite created</h3>
              <p className="text-sm text-tx-muted mt-0.5">
                Share this link with {email} - email sending isn't set up yet, so send it yourself
                (text, email, however you'd reach them).
              </p>
            </div>
          </div>

          <label htmlFor="invite-link" className="block text-sm font-medium text-tx-secondary mb-1">
            Invite link
          </label>
          <div className="flex gap-2">
            <input
              id="invite-link"
              type="text"
              readOnly
              value={inviteLink}
              title="Invite link"
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-surface2 border border-edge-strong rounded-lg font-mono text-tx-secondary truncate"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              onClick={copyLink}
              title="Copy invite link to clipboard"
              className={copied ? 'bg-status-success-text hover:brightness-100' : ''}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>

          <div className="flex justify-end mt-6">
            <Button type="button" variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-tx-primary mb-4">Invite Team Member</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-tx-secondary mb-1">Email Address</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-edge-strong rounded-lg p-2 focus:ring-primary focus:border-primary"
              required
              placeholder="Enter email address"
              title="Email Address"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium text-tx-secondary mb-1">Role</label>
            {/* 'owner' is intentionally NOT offered here. Ownership is the
                highest-privilege role (can grant/revoke other owners, is the
                only role that can never be fully removed from a tenant), so
                it's assigned only via an explicit role change made by an
                existing owner - never through the invite flow. Don't add it
                to this dropdown without reconsidering that boundary. */}
            <select
              id="invite-role"
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-edge-strong rounded-lg p-2 focus:ring-primary focus:border-primary"
              title="Select a role"
            >
              <option value="admin">Admin</option>
              <option value="staff">Office Staff</option>
              <option value="instructor">Instructor</option>
              <option value="viewer">Viewer</option>
            </select>
            <p className="mt-1 text-xs text-tx-muted">
              {role === 'instructor' && "Instructors can only view their own students and lessons."}
              {role === 'staff' && "Staff can manage all students and lessons but cannot access billing."}
              {role === 'admin' && "Admins have full access to everything in the school."}
              {role === 'viewer' && "Viewers have read-only access to the school's data."}
            </p>
          </div>
          {inviteMutation.isError && (
            <p className="text-sm text-status-danger-text">
              {(inviteMutation.error as Error & { response?: { data?: { error?: string } } })?.response?.data?.error
                || 'Failed to create the invite. Please try again.'}
            </p>
          )}
          <div className="flex justify-end space-x-3 mt-6">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={inviteMutation.isPending}>
              {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
