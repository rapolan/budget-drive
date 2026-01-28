import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import * as userService from '../services/userService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * GET /api/v1/users
 */
export const getTeamMembers = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const users = await userService.getUsersByTenant(tenantId);
  res.json({ success: true, data: users });
});

/**
 * GET /api/v1/users/:id
 */
export const getUserDetails = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const user = await userService.getUserWithMembership(id, tenantId);
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, data: user });
});

/**
 * POST /api/v1/users
 */
export const createTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const user = await userService.createUserAndAddToTenant(
    tenantId,
    req.body,
    req.body.role,
    req.user?.userId
  );
  res.status(201).json({ success: true, data: user });
});

/**
 * PATCH /api/v1/users/:id
 */
export const updateTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const membership = await userService.updateUserMembership(id, tenantId, req.body);
  res.json({ success: true, data: membership });
});

/**
 * DELETE /api/v1/users/:id
 */
export const removeTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  // Prevent removing yourself - controller-level guard
  if (req.user?.userId === id) throw new AppError('Cannot remove yourself', 400);
  await userService.removeUserFromTenant(id, tenantId);
  res.json({ success: true, message: 'User removed from team' });
});

/**
 * POST /api/v1/users/invite
 */
export const inviteTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId || 'system';
  const user = await userService.inviteUserToTenant(req.body.email, tenantId, req.body.role, userId);
  res.status(201).json({ success: true, data: user });
});
