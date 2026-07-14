/**
 * Treasury Routes
 * API routes for BDP treasury management (satoshi-level fees)
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import * as treasuryController from '../controllers/treasuryController';

const router = Router();

// All treasury routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

/**
 * GET /api/v1/treasury/status
 * Ledger status — available in all modes (enabled or disabled)
 */
router.get('/status', treasuryController.getStatus);

/**
 * GET /api/v1/treasury/balance
 * Get treasury balance for current tenant
 */
router.get('/balance', treasuryController.getBalance);

/**
 * GET /api/v1/treasury/transactions
 * Get recent treasury transactions
 */
router.get('/transactions', treasuryController.getTransactions);

/**
 * GET /api/v1/treasury/statistics
 * Get treasury statistics (balance + aggregates)
 */
router.get('/statistics', treasuryController.getStatistics);

export default router;
