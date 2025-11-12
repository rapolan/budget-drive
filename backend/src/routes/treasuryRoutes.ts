/**
 * Treasury Routes
 * API routes for BDP treasury management (satoshi-level fees)
 */

import { Router } from 'express';
import { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import treasuryService from '../services/treasuryService';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// All treasury routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

/**
 * GET /api/v1/treasury/balance
 * Get treasury balance for current tenant
 */
router.get(
  '/balance',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const balance = await treasuryService.getBalance(tenantId);
    res.json(balance);
  })
);

/**
 * GET /api/v1/treasury/transactions
 * Get recent treasury transactions
 */
router.get(
  '/transactions',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const limit = parseInt(req.query.limit as string) || 50;
    const transactions = await treasuryService.getRecentTransactions(tenantId, limit);
    res.json(transactions);
  })
);

/**
 * GET /api/v1/treasury/statistics
 * Get treasury statistics (balance + aggregates)
 */
router.get(
  '/statistics',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const stats = await treasuryService.getStatistics(tenantId);
    res.json(stats);
  })
);

export default router;
