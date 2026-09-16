import express from 'express';
import * as userController from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';

const router = express.Router();

// All routes require auth and tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Team roster visibility is admin/staff territory - not part of the
// instructor-view design (instructors have no reason to browse the staff
// directory, and previously any authenticated tenant member, instructor
// included, could read it).
router.get('/', requireRole('owner', 'admin', 'staff'), userController.getTeamMembers);
router.get('/:id', requireRole('owner', 'admin', 'staff'), userController.getUserDetails);

// Only owner/admin can manage team membership
router.post('/', requireRole('owner', 'admin'), userController.createTeamMember);
router.post('/invite', requireRole('owner', 'admin'), userController.inviteTeamMember);
router.post('/:id/reset-password', requireRole('owner', 'admin'), userController.resetTeamMemberPassword);
router.post('/:id/resend-invite', requireRole('owner', 'admin'), userController.resendTeamInvite);
router.patch('/:id', requireRole('owner', 'admin'), userController.updateTeamMember);
router.delete('/:id', requireRole('owner', 'admin'), userController.removeTeamMember);

export default router;
