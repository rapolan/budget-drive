import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
import { UserPlus, MoreVertical, Shield, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/common/Button';

export const TeamSettings: React.FC = () => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

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
        <div className="bg-surface border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-surface2">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-tx-muted uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-tx-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-[var(--border)]">
              {team.map((user: any) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
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
                      user.membershipStatus === 'active' ? 'bg-green-100 text-green-800' :
                      user.membershipStatus === 'invited' ? 'bg-yellow-100 text-yellow-800' :
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
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="More actions"
                      title="More actions"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </Button>
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
    </div>
  );
};

const InviteModal = ({ onClose }: { onClose: () => void }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const queryClient = useQueryClient();

  const inviteMutation = useMutation({
    mutationFn: usersApi.invite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    inviteMutation.mutate({ email, role: role as any });
  };

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
              className="w-full border border-[var(--border-strong)] rounded-lg p-2 focus:ring-primary focus:border-primary"
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
              className="w-full border border-[var(--border-strong)] rounded-lg p-2 focus:ring-primary focus:border-primary"
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
