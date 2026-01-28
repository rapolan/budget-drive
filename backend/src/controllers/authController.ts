/**
 * Authentication Controller
 * HTTP handlers for authentication endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as authService from '../services/authService';

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and return JWT token
 * @access  Public
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Validate required fields
  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: 'Email and password are required',
    });
    return;
  }

  const result = await authService.login(email, password);

  res.json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
      tenantId: result.tenantId,
    },
    message: 'Login successful',
  });
});

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user account
 * @access  Public (or restricted based on settings)
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, fullName, tenantId } = req.body;

  // Validate required fields
  if (!email || !password || !fullName) {
    res.status(400).json({
      success: false,
      error: 'Email, password, and full name are required',
    });
    return;
  }

  const result = await authService.register(email, password, fullName, tenantId);

  res.status(201).json({
    success: true,
    data: { userId: result.userId },
    message: 'Account created successfully. Please log in.',
  });
});

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (client-side token removal, optional server-side blacklist)
 * @access  Private
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // For JWT-based auth, logout is primarily client-side (delete token)
  // Here we could implement token blacklisting if needed in the future

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user info
 * @access  Private
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const tenantId = req.user?.tenantId;

  if (!userId || !tenantId) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const user = await authService.getCurrentUser(userId, tenantId);

  res.json({
    success: true,
    data: user,
  });
});

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { currentPassword, newPassword } = req.body;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  if (!currentPassword || !newPassword) {
    res.status(400).json({
      success: false,
      error: 'Current password and new password are required',
    });
    return;
  }

  await authService.changePassword(userId, currentPassword, newPassword);

  res.json({
    success: true,
    message: 'Password changed successfully',
  });
});
