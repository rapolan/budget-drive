/**
 * Authentication Middleware
 * Protects routes and validates JWT tokens
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { verifyToken, extractTokenFromHeader, JwtPayload } from '../utils/jwt';

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
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
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
