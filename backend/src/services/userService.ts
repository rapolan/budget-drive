/**
 * User Service
 * Business logic for user & tenant membership management
 */

import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import {
  UserWithMembership,
  CreateUserInput,
  UpdateMembershipInput,
  UserTenantMembership,
  UserRole,
} from '../types';

const logger = createLogger('UserService');

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
 */
export const createUserAndAddToTenant = async (
  tenantId: string,
  userData: CreateUserInput,
  role: UserRole,
  invitedBy?: string
): Promise<UserWithMembership> => {
  logger.info('Creating user and adding to tenant', { tenantId, email: userData.email });

  // Upsert user by email (simple flow: if exists, use existing)
  const userRes = await query('SELECT * FROM users WHERE email = $1', [userData.email]);

  let user = null;
  if (userRes.rows.length === 0) {
    const createRes = await query(
      `INSERT INTO users (email, full_name, phone, password_hash, email_verified, created_at, updated_at)
       VALUES ($1,$2,$3,$4, FALSE, NOW(), NOW()) RETURNING *`,
      [userData.email, userData.fullName || null, userData.phone || null, userData.password || null]
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
 */
export const updateUserMembership = async (
  userId: string,
  tenantId: string,
  updates: UpdateMembershipInput
): Promise<UserTenantMembership> => {
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
 * Remove user from tenant
 */
export const removeUserFromTenant = async (userId: string, tenantId: string): Promise<void> => {
  await query('DELETE FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
};

/**
 * Invite user to tenant (creates invited membership record)
 */
export const inviteUserToTenant = async (
  email: string,
  tenantId: string,
  role: UserRole,
  invitedBy: string
): Promise<UserWithMembership> => {
  logger.info('Inviting user to tenant', { tenantId, email, role, invitedBy });

  // Ensure user exists (create minimal user record)
  let userRes = await query('SELECT * FROM users WHERE email = $1', [email]);
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
    `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status, invited_by, invited_at, created_at, updated_at)
     VALUES ($1,$2,$3,'invited',$4,NOW(),NOW(),NOW()) RETURNING *`,
    [user.id, tenantId, role, invitedBy]
  );

  const combined = {
    ...user,
    ...insert.rows[0],
  };

  return keysToCamel(combined) as UserWithMembership;
};

export default {
  getUsersByTenant,
  getUserWithMembership,
  createUserAndAddToTenant,
  updateUserMembership,
  removeUserFromTenant,
  inviteUserToTenant,
};
