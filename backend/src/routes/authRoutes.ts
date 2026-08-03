/**
 * Authentication Routes
 * Public and protected auth endpoints
 */

import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public routes (no authentication required). authLimiter is scoped to just
// these credential-guessing-prone endpoints - NOT the whole /auth prefix -
// so that session-check traffic like GET /me (called on every page load)
// can't burn through the strict 10-req/15min budget meant for login attempts.
router.post('/login', authLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.post('/accept-invite', authLimiter, authController.acceptInvite);

// Protected routes (require authentication)
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/change-password', authenticate, authController.changePassword);

export default router;
