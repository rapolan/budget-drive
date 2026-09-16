import type { UserRole } from '@/types';

// Where a role lands by default - the admin Dashboard for everyone except
// instructor-role users, who get their own purpose-built shell instead of
// the shared admin Dashboard with pieces hidden.
export function landingPathForRole(role?: UserRole): string {
  return role === 'instructor' ? '/my/today' : '/';
}
