/**
 * User Service
 * Business logic for user & tenant membership management
 */

import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import { hashPassword } from './authService';
import {
  UserWithMembership,
  CreateUserInput,
  UpdateMembershipInput,
  UserTenantMembership,
  UserRole,
} from '../types';

const logger = createLogger('UserService');

/**
 * Count active owners for a tenant. Used to protect against removing or
 * demoting the last owner, which would leave the tenant with no one able
 * to manage ownership-level settings.
 */
const countActiveOwners = async (tenantId: string, excludeUserId?: string): Promise<number> => {
  const result = await query(
    `SELECT COUNT(*) FROM user_tenant_memberships
     WHERE tenant_id = $1 AND role = 'owner' AND status = 'active'
       AND user_id != COALESCE($2, '00000000-0000-0000-0000-000000000000')`,
    [tenantId, excludeUserId || null]
  );
  return parseInt(result.rows[0].count, 10);
};

/**
 * Get a user's current role for a tenant, fresh from the database (not
 * from a JWT claim, which can be stale). Returns null if there's no
 * membership.
 */
export const getCurrentRole = async (userId: string, tenantId: string): Promise<UserRole | null> => {
  const result = await query(
    `SELECT role FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'`,
    [userId, tenantId]
  );
  return result.rows.length > 0 ? result.rows[0].role : null;
};

/**
 * Get all users in a tenant (active + invited)
 */
export const getUsersByTenant = async (
  tenantId: string
): Promise<UserWithMembership[]> => {
  logger.info('Fetching users for tenant', { tenantId });

  const result = await query(
    `SELECT
       u.*,
       utm.id as membership_id,
       utm.role,
       utm.status as membership_status,
       utm.instructor_id,
       utm.invited_at,
       utm.accepted_at
     FROM users u
     INNER JOIN user_tenant_memberships utm ON u.id = utm.user_id
     WHERE utm.tenant_id = $1
       AND utm.status IN ('active','invited')
     ORDER BY utm.created_at DESC`,
    [tenantId]
  );

  return result.rows.map(keysToCamel) as UserWithMembership[];
};

/**
 * Get single user with membership details
 */
export const getUserWithMembership = async (
  userId: string,
  tenantId: string
): Promise<UserWithMembership | null> => {
  const result = await query(
    `SELECT
       u.*,
       utm.id as membership_id,
       utm.role,
       utm.status as membership_status,
       utm.instructor_id,
       utm.invited_at,
       utm.accepted_at
     FROM users u
     INNER JOIN user_tenant_memberships utm ON u.id = utm.user_id
     WHERE utm.tenant_id = $1 AND u.id = $2`,
    [tenantId, userId]
  );

  if (result.rows.length === 0) return null;
  return keysToCamel(result.rows[0]) as UserWithMembership;
};

/**
 * Create new user and add to tenant (creates user row if needed)
 *
 * @param callerRole - role of the user making this request, required to
 *   enforce that only an existing owner can grant the 'owner' role
 */
export const createUserAndAddToTenant = async (
  tenantId: string,
  userData: CreateUserInput,
  role: UserRole,
  invitedBy?: string,
  callerRole?: UserRole
): Promise<UserWithMembership> => {
  logger.info('Creating user and adding to tenant', { tenantId, email: userData.email });

  if (role === 'owner' && callerRole !== 'owner') {
    throw new AppError('Only an owner can assign the owner role', 403);
  }

  // Upsert user by email (simple flow: if exists, use existing)
  const userRes = await query('SELECT * FROM users WHERE email = $1', [userData.email]);

  let user = null;
  if (userRes.rows.length === 0) {
    const passwordHash = userData.password ? await hashPassword(userData.password) : null;
    const createRes = await query(
      `INSERT INTO users (email, full_name, phone, password_hash, email_verified, created_at, updated_at)
       VALUES ($1,$2,$3,$4, FALSE, NOW(), NOW()) RETURNING *`,
      [userData.email, userData.fullName || null, userData.phone || null, passwordHash]
    );
    user = createRes.rows[0];
  } else {
    user = userRes.rows[0];
  }

  // Create membership if not exists
  const membershipCheck = await query(
    'SELECT * FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
    [user.id, tenantId]
  );

  if (membershipCheck.rows.length === 0) {
    const status = 'active';
    const insert = await query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status, invited_by, invited_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),NOW()) RETURNING *`,
      [user.id, tenantId, role, status, invitedBy || null]
    );

    const combined = {
      ...user,
      ...insert.rows[0],
    };

    return keysToCamel(combined) as UserWithMembership;
  }

  // Already member — return existing joined row
  const joined = await getUserWithMembership(user.id, tenantId);
  if (!joined) throw new AppError('Failed to fetch created membership', 500);
  return joined;
};

/**
 * Update user membership (role, status)
 *
 * @param callerId - user id of the caller, required to block a user from
 *   changing their own role
 * @param callerRole - role of the caller, required to enforce that only an
 *   owner can grant or revoke the 'owner' role, and to protect the last
 *   owner from being demoted
 */
export const updateUserMembership = async (
  userId: string,
  tenantId: string,
  updates: UpdateMembershipInput,
  callerId?: string,
  callerRole?: UserRole
): Promise<UserTenantMembership> => {
  if (updates.role !== undefined) {
    if (callerId && userId === callerId) {
      throw new AppError('You cannot change your own role', 403);
    }

    // Assigning OR revoking the owner role both require the caller to
    // already be an owner
    const existing = await query(
      `SELECT role FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    if (existing.rows.length === 0) throw new AppError('Membership not found', 404);
    const currentRole: UserRole = existing.rows[0].role;

    if ((updates.role === 'owner' || currentRole === 'owner') && callerRole !== 'owner') {
      throw new AppError('Only an owner can assign or change the owner role', 403);
    }

    // Demoting the last active owner would leave the tenant with no owner
    if (currentRole === 'owner' && updates.role !== 'owner') {
      const remainingOwners = await countActiveOwners(tenantId, userId);
      if (remainingOwners === 0) {
        throw new AppError('Cannot demote the last owner of this tenant', 400);
      }
    }
  }

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (updates.role !== undefined) {
    fields.push(`role = $${i++}`);
    values.push(updates.role);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${i++}`);
    values.push(updates.status);
  }
  if (updates.instructorId !== undefined) {
    fields.push(`instructor_id = $${i++}`);
    values.push(updates.instructorId);
  }

  if (fields.length === 0) throw new AppError('No updates provided', 400);

  values.push(userId);
  values.push(tenantId);

  const sql = `UPDATE user_tenant_memberships SET ${fields.join(', ')}, updated_at = NOW() WHERE user_id = $${i++} AND tenant_id = $${i++} RETURNING *`;

  const res = await query(sql, values);
  if (res.rows.length === 0) throw new AppError('Membership not found', 404);
  return keysToCamel(res.rows[0]) as UserTenantMembership;
};

/**
 * Remove user from tenant. Blocks removing the last active owner.
 */
export const removeUserFromTenant = async (userId: string, tenantId: string): Promise<void> => {
  const existing = await query(
    `SELECT role FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
  if (existing.rows.length === 0) throw new AppError('Membership not found', 404);

  if (existing.rows[0].role === 'owner') {
    const remainingOwners = await countActiveOwners(tenantId, userId);
    if (remainingOwners === 0) {
      throw new AppError('Cannot remove the last owner of this tenant', 400);
    }
  }

  await query('DELETE FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
};

/**
 * Invite user to tenant (creates invited membership record)
 */
export const inviteUserToTenant = async (
  email: string,
  tenantId: string,
  role: UserRole,
  invitedBy: string,
  instructorId?: string
): Promise<UserWithMembership> => {
  logger.info('Inviting user to tenant', { tenantId, email, role, invitedBy, instructorId });

  // Ensure user exists (create minimal user record)
  const userRes = await query('SELECT * FROM users WHERE email = $1', [email]);
  let user = null;
  if (userRes.rows.length === 0) {
    const createRes = await query(
      `INSERT INTO users (email, full_name, email_verified, created_at, updated_at)
       VALUES ($1,$2,FALSE,NOW(),NOW()) RETURNING *`,
      [email, null]
    );
    user = createRes.rows[0];
  } else {
    user = userRes.rows[0];
  }

  // Create invited membership
  const insert = await query(
    `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status, instructor_id, invited_by, invited_at, created_at, updated_at)
     VALUES ($1,$2,$3,'invited',$4,$5,NOW(),NOW(),NOW()) RETURNING *`,
    [user.id, tenantId, role, instructorId || null, invitedBy]
  );

  const combined = {
    ...user,
    ...insert.rows[0],
  };

  return keysToCamel(combined) as UserWithMembership;
};

export default {
  getCurrentRole,
  getUsersByTenant,
  getUserWithMembership,
  createUserAndAddToTenant,
  updateUserMembership,
  removeUserFromTenant,
  inviteUserToTenant,
};
