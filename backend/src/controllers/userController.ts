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
  const callerId = req.user?.userId;
  const callerRole = callerId ? await userService.getCurrentRole(callerId, tenantId) : null;
  const user = await userService.createUserAndAddToTenant(
    tenantId,
    req.body,
    req.body.role,
    callerId,
    callerRole || undefined
  );
  res.status(201).json({ success: true, data: user });
});

/**
 * PATCH /api/v1/users/:id
 */
export const updateTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const callerId = req.user?.userId;
  const callerRole = callerId ? await userService.getCurrentRole(callerId, tenantId) : null;
  const membership = await userService.updateUserMembership(
    id,
    tenantId,
    req.body,
    callerId,
    callerRole || undefined
  );
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
  const callerId = req.user?.userId;
  const callerRole = callerId ? await userService.getCurrentRole(callerId, tenantId) : null;
  await userService.removeUserFromTenant(id, tenantId, callerRole || undefined);
  res.json({ success: true, message: 'User removed from team' });
});

/**
 * POST /api/v1/users/:id/reset-password
 *
 * INTERIM measure: sets a new temporary password for another team member
 * with no email delivery required. The real long-term fix is a
 * self-service "forgot password" flow (with email delivery) once email
 * sending is built as its own feature - this exists so an admin can
 * unblock a locked-out teammate today. requireRole('owner','admin') at
 * the route layer is the authorization gate, matching how the invite
 * endpoint is gated.
 */
export const resetTeamMemberPassword = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const callerId = req.user?.userId;
  if (!callerId) throw new AppError('Authentication required', 401);

  const { temporaryPassword } = await userService.resetUserPassword(id, tenantId, callerId);
  res.json({ success: true, data: { temporaryPassword } });
});

/**
 * POST /api/v1/users/invite
 */
export const inviteTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const callerId = req.user?.userId || 'system';
  const callerRole = req.user?.userId
    ? await userService.getCurrentRole(req.user.userId, tenantId)
    : null;
  const { inviteToken, ...user } = await userService.inviteUserToTenant(
    req.body.email,
    tenantId,
    req.body.role,
    callerId,
    req.body.instructorId,
    callerRole || undefined
  );

  const inviteLink = buildInviteLink(inviteToken);

  res.status(201).json({ success: true, data: { ...user, inviteLink } });
});

/**
 * POST /api/v1/users/:id/resend-invite
 *
 * For a user still in 'invited' status - regenerates their invite
 * token/expiry and returns a fresh link using the same copy-link UI
 * pattern as the original invite. Also the fix for the previously-500ing
 * "re-invite an invited email" path, since this UPDATEs the existing
 * membership row rather than attempting a duplicate INSERT.
 */
export const resendTeamInvite = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const { inviteToken } = await userService.resendInvite(id, tenantId);
  const inviteLink = buildInviteLink(inviteToken);

  res.json({ success: true, data: { inviteLink } });
});

function buildInviteLink(inviteToken: string): string {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${frontendUrl}/accept-invite?token=${inviteToken}`;
}
