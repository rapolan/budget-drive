/**
 * Authentication Middleware
 * Protects routes and validates JWT tokens
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { verifyToken, extractTokenFromHeader, JwtPayload } from '../utils/jwt';
import { config } from '../config/env';

// Extend Express Request to include user data
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Authentication middleware - Requires valid JWT token
 * In development mode, bypasses authentication for easier testing
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    // DEVELOPMENT MODE: Bypass authentication with hardcoded tenant ID
    if (config.NODE_ENV === 'development') {
      // Use hardcoded UUID for development - matches first seeded tenant
      // This avoids database dependency issues during auth
      const tenantId = '55654b9d-6d7f-46e0-ade2-be606abfe00a';

      req.user = {
        userId: '00000000-0000-0000-0000-000000000001',
        tenantId: tenantId,
        email: 'dev@budgetdrivingschool.com',
        role: 'admin',
      };
      return next();
    }

    // PRODUCTION MODE: Require authentication
    // Extract token from Authorization header
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      throw new AppError('Authentication required. No token provided.', 401);
    }

    // Verify token
    const decoded = verifyToken(token);

    // Attach user data to request
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Invalid or expired authentication token', 401);
  }
};

/**
 * Optional authentication - Attaches user if token exists, but doesn't require it
 */
export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (token) {
      const decoded = verifyToken(token);
      req.user = decoded;
    }

    next();
  } catch (error) {
    // Silently fail - user just won't be authenticated
    next();
  }
};
