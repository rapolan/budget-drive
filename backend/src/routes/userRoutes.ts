import express from 'express';
import * as userController from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';

const router = express.Router();

// All routes require auth and tenant context
router.use(authenticate);
router.use(requireTenantContext);

router.get('/', userController.getTeamMembers);
router.get('/:id', userController.getUserDetails);
router.post('/', userController.createTeamMember);
router.post('/invite', userController.inviteTeamMember);
router.patch('/:id', userController.updateTeamMember);
router.delete('/:id', userController.removeTeamMember);

export default router;
