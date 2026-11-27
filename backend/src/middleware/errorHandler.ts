/**
 * Error Handling Middleware
 * Centralized error handling for the application
 */

import { Request, Response, NextFunction } from 'express';
import { SchedulingConflict } from '../types';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  conflicts?: SchedulingConflict[];
  // A short, stable machine-readable identifier (e.g. 'PAYMENT_REQUIRED')
  // a frontend caller can switch on, distinct from `message` (which stays
  // free text for display and can change wording without breaking a
  // caller that only checks `code`). Optional - most AppErrors have none,
  // matching `conflicts`' own already-optional pattern.
  code?: string;

  constructor(message: string, statusCode: number = 500, conflicts?: SchedulingConflict[], code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.conflicts = conflicts;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Default error values
  let statusCode = 500;
  let message = 'Internal server error';
  let isOperational = false;

  // Check if it's our custom AppError
  let conflicts: SchedulingConflict[] | undefined;
  let code: string | undefined;
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
    conflicts = err.conflicts;
    code = err.code;
  }

  // Log error
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    statusCode,
    isOperational,
    path: req.path,
    method: req.method,
  });

  // Send response
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(code && { code }),
    ...(conflicts?.length && {
      conflictType: conflicts[0].type,
      conflicts,
    }),
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err,
    }),
  });
};

// Async error wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
