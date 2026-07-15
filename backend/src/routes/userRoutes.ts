import express from 'express';
import * as userController from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';

const router = express.Router();

// All routes require auth and tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Any authenticated tenant member can view the team
router.get('/', userController.getTeamMembers);
router.get('/:id', userController.getUserDetails);

// Only owner/admin can manage team membership
router.post('/', requireRole('owner', 'admin'), userController.createTeamMember);
router.post('/invite', requireRole('owner', 'admin'), userController.inviteTeamMember);
router.patch('/:id', requireRole('owner', 'admin'), userController.updateTeamMember);
router.delete('/:id', requireRole('owner', 'admin'), userController.removeTeamMember);

export default router;
