/**
 * Recurring Pattern API Routes
 */

import express from 'express';
import { recurringPatternService } from '../services/recurringPatternService';
import { authenticate } from '../middleware/authenticate';
import { requireTenantContext } from '../middleware/requireTenantContext';

const router = express.Router();

router.use(authenticate);
router.use(requireTenantContext);

/**
 * POST /api/v1/patterns
 * Create recurring pattern
 */
router.post('/', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const pattern = await recurringPatternService.createPattern(tenantId, req.body);
    res.json({ success: true, data: pattern });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/patterns
 * Get all patterns
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const patterns = await recurringPatternService.getPatterns(tenantId);
    res.json({ success: true, data: patterns });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/patterns/:id/generate
 * Generate lessons from pattern
 */
router.post('/:id/generate', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const result = await recurringPatternService.generateLessons(id, tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/patterns/:id/exceptions
 * Add exception date
 */
router.post('/:id/exceptions', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    const { date, reason } = req.body;
    const exception = await recurringPatternService.addException(id, tenantId, date, reason);
    res.json({ success: true, data: exception });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v1/patterns/:id
 * Delete pattern
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;
    await recurringPatternService.deletePattern(id, tenantId);
    res.json({ success: true, message: 'Pattern deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
