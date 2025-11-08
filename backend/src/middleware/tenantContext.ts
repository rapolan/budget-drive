/**
 * Tenant Context Middleware
 * CRITICAL: Multi-tenant security - ensures data isolation between tenants
 * This middleware MUST be used on all routes that access tenant-specific data
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

/**
 * Tenant Context Middleware
 * Extracts and validates tenant ID from authenticated user
 * MUST be used after authenticate() middleware
 */
export const requireTenantContext = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  // Ensure user is authenticated
  if (!req.user) {
    throw new AppError(
      'Authentication required before accessing tenant context',
      401
    );
  }

  // Extract tenant ID from authenticated user
  const { tenantId } = req.user;

  if (!tenantId) {
    throw new AppError(
      'No tenant context found for authenticated user',
      403
    );
  }

  // Attach tenant ID to request for easy access
  req.tenantId = tenantId;

  next();
};

/**
 * Helper function to get tenant ID from request
 * Use this in controllers to ensure tenant filtering
 */
export const getTenantId = (req: Request): string => {
  if (!req.tenantId) {
    throw new AppError('Tenant context not found in request', 500);
  }
  return req.tenantId;
};

/**
 * Validate that a resource belongs to the current tenant
 * Use this when fetching resources by ID to prevent cross-tenant access
 */
export const validateTenantOwnership = (
  resourceTenantId: string,
  requestTenantId: string
) => {
  if (resourceTenantId !== requestTenantId) {
    throw new AppError(
      'Access denied: Resource does not belong to your organization',
      403
    );
  }
};
