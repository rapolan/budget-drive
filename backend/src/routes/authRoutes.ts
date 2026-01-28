/**
 * Authentication Routes
 * Public and protected auth endpoints
 */

import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes (no authentication required)
router.post('/login', authController.login);
router.post('/register', authController.register);

// Protected routes (require authentication)
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/change-password', authenticate, authController.changePassword);

export default router;
