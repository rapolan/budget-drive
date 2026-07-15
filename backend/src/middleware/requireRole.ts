/**
 * Role Authorization Middleware
 * Restricts a route to specific roles within the current tenant membership
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { query } from '../config/database';
import { UserRole } from '../types';

/**
 * requireRole(...roles) - must run after authenticate() and
 * requireTenantContext(). Looks up the caller's CURRENT role and status
 * for the tenant directly from the database (not from the JWT claim,
 * which can be stale for up to JWT_EXPIRE if a role was changed or the
 * membership was suspended since the token was issued) and rejects with
 * 403 if the role isn't one of the allowed roles, or the membership is
 * no longer active.
 */
export const requireRole = (...roles: UserRole[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const tenantId = req.tenantId;

      if (!userId || !tenantId) {
        throw new AppError('Authentication required before checking role', 401);
      }

      const result = await query(
        `SELECT role, status FROM user_tenant_memberships
         WHERE user_id = $1 AND tenant_id = $2`,
        [userId, tenantId]
      );

      if (result.rows.length === 0) {
        throw new AppError('No membership found for this tenant', 403);
      }

      const membership = result.rows[0];

      if (membership.status !== 'active') {
        throw new AppError('Your membership is not active', 403);
      }

      if (!roles.includes(membership.role)) {
        throw new AppError('You do not have permission to perform this action', 403);
      }

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      next(new AppError('Role authorization check failed', 403));
    }
  };
};
