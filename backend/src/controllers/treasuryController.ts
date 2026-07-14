/**
 * Treasury Controller
 * HTTP handlers for BDP treasury endpoints
 *
 * Depends only on the ledger seam (`ledger`) — never treasuryService or
 * walletService directly, so this controller (and the route that wires it
 * up) stays safe to import even when BSV_ENABLED=false.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ledger } from '../services/Ledger';

/**
 * @route   GET /api/v1/treasury/status
 * @desc    Ledger status — always available regardless of BSV_ENABLED
 * @access  Private
 */
export const getStatus = asyncHandler(async (_req: Request, res: Response) => {
  const status = await ledger.getStatus();
  res.json({
    success: true,
    data: status,
  });
});

const disabledResponse = (res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Ledger disabled',
  });
};

/**
 * @route   GET /api/v1/treasury/balance
 * @desc    Get treasury balance for current tenant
 * @access  Private
 */
export const getBalance = asyncHandler(async (_req: Request, res: Response) => {
  if (!ledger.enabled) {
    disabledResponse(res);
    return;
  }
  disabledResponse(res);
});

/**
 * @route   GET /api/v1/treasury/transactions
 * @desc    Get recent treasury transactions
 * @access  Private
 */
export const getTransactions = asyncHandler(async (_req: Request, res: Response) => {
  if (!ledger.enabled) {
    disabledResponse(res);
    return;
  }
  disabledResponse(res);
});

/**
 * @route   GET /api/v1/treasury/statistics
 * @desc    Get treasury statistics (balance + aggregates)
 * @access  Private
 */
export const getStatistics = asyncHandler(async (_req: Request, res: Response) => {
  if (!ledger.enabled) {
    disabledResponse(res);
    return;
  }
  disabledResponse(res);
});
