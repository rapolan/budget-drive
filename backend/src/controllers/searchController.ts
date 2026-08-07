/**
 * Search Controller
 * HTTP handlers for cross-entity search
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as searchService from '../services/searchService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/search/people
 * @desc    Search students and guardians together by name, email, or phone
 * @access  Private
 */
export const searchPeople = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const term = (req.query.q as string) || '';

  const results = await searchService.searchPeople(tenantId, term);

  res.json({
    success: true,
    data: results,
  });
});
