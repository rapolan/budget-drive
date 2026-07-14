/**
 * Rate Limiting Middleware
 * Throttles request volume to mitigate brute-force and abuse
 */

import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

const windowMs = config.RATE_LIMIT_WINDOW * 60 * 1000;

// General API limiter - applies to all routes
export const apiLimiter = rateLimit({
  windowMs,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});

// Stricter limiter for auth routes to slow down credential-guessing attacks
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
  },
});
