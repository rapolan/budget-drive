/**
 * Search Routes
 * API routes for cross-entity search
 */

import { Router } from 'express';
import * as searchController from '../controllers/searchController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

router.get('/search/people', searchController.searchPeople);

export default router;
