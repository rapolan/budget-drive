/**
 * Authentication Service
 * Handles user authentication, password hashing, and login logic
 */

import bcrypt from 'bcrypt';
import { query } from '../config/database';
import { generateToken, JwtPayload } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';

const SALT_ROUNDS = 10;

export interface LoginResult {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
  };
  token: string;
  tenantId: string;
}

/**
 * Hash a password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Verify a password against a hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Authenticate user with email and password
 * Returns user info and JWT token on success
 */
export const login = async (email: string, password: string): Promise<LoginResult> => {
  // Find user by email
  const userResult = await query(
    `SELECT id, email, password_hash, full_name, email_verified
     FROM users
     WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = userResult.rows[0];

  // Verify password
  const isValidPassword = await verifyPassword(password, user.password_hash);
  if (!isValidPassword) {
    throw new AppError('Invalid email or password', 401);
  }

  // Get user's tenant membership (use first active membership)
  const membershipResult = await query(
    `SELECT utm.tenant_id, utm.role, utm.status, t.name as tenant_name
     FROM user_tenant_memberships utm
     JOIN tenants t ON t.id = utm.tenant_id
     WHERE utm.user_id = $1 AND utm.status = 'active'
     ORDER BY utm.created_at ASC
     LIMIT 1`,
    [user.id]
  );

  if (membershipResult.rows.length === 0) {
    throw new AppError('No active tenant membership found. Please contact your administrator.', 403);
  }

  const membership = membershipResult.rows[0];

  // Update last login timestamp
  await query(
    `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
    [user.id]
  );

  // Generate JWT token
  const tokenPayload: JwtPayload = {
    userId: user.id,
    tenantId: membership.tenant_id,
    email: user.email,
    role: membership.role,
  };

  const token = generateToken(tokenPayload);

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: membership.role,
    },
    token,
    tenantId: membership.tenant_id,
  };
};

/**
 * Register a new user
 */
export const register = async (
  email: string,
  password: string,
  fullName: string,
  tenantId?: string
): Promise<{ userId: string }> => {
  // Check if email already exists
  const existingUser = await query(
    `SELECT id FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  if (existingUser.rows.length > 0) {
    throw new AppError('An account with this email already exists', 409);
  }

  // Validate password strength
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters long', 400);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const userResult = await query(
    `INSERT INTO users (email, password_hash, full_name, email_verified)
     VALUES ($1, $2, $3, FALSE)
     RETURNING id`,
    [email.toLowerCase().trim(), passwordHash, fullName]
  );

  const userId = userResult.rows[0].id;

  // If tenantId provided, create membership
  if (tenantId) {
    await query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status, accepted_at)
       VALUES ($1, $2, 'staff', 'active', NOW())`,
      [userId, tenantId]
    );
  }

  return { userId };
};

/**
 * Change user password
 */
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  // Get current password hash
  const userResult = await query(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  // Verify current password
  const isValid = await verifyPassword(currentPassword, userResult.rows[0].password_hash);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  // Validate new password
  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters long', 400);
  }

  // Hash and update password
  const newPasswordHash = await hashPassword(newPassword);
  await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [newPasswordHash, userId]
  );
};

/**
 * Get current user info with tenant membership
 */
export const getCurrentUser = async (userId: string, tenantId: string) => {
  const result = await query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.profile_photo_url,
            u.email_verified, u.last_login_at, u.created_at,
            utm.role, utm.status as membership_status, utm.instructor_id
     FROM users u
     JOIN user_tenant_memberships utm ON utm.user_id = u.id
     WHERE u.id = $1 AND utm.tenant_id = $2`,
    [userId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found or not a member of this tenant', 404);
  }

  const user = result.rows[0];
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    profilePhotoUrl: user.profile_photo_url,
    emailVerified: user.email_verified,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    role: user.role,
    membershipStatus: user.membership_status,
    instructorId: user.instructor_id,
  };
};
