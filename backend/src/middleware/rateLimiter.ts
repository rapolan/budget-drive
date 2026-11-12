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

// Self-service signup - invite-code validation and the signup submission
// itself. Both match authLimiter's exact 10/15min budget (own instances,
// not a shared counter bucket with /login) - an attacker needs a VALID
// code to get anywhere useful at either endpoint, so neither needs a
// stricter budget than the one already established for credential
// endpoints.
export const signupCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});

export const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});
