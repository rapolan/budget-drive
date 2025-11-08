/**
 * JWT Utilities
 * Token generation and verification
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface JwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  role?: string;
}

/**
 * Generate JWT token
 */
export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRE as any,
  });
};

/**
 * Verify JWT token
 */
export const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Extract token from Authorization header
 */
export const extractTokenFromHeader = (authHeader?: string): string | null => {
  if (!authHeader) {
    return null;
  }

  // Format: "Bearer <token>"
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};
