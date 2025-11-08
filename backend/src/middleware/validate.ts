/**
 * Request Validation Middleware
 * Input validation and sanitization
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// UUID validation
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Validate UUID parameter
export const validateUUID = (paramName: string = 'id') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];

    if (!uuid) {
      throw new AppError(`Missing parameter: ${paramName}`, 400);
    }

    if (!isValidUUID(uuid)) {
      throw new AppError(`Invalid UUID format for ${paramName}`, 400);
    }

    next();
  };
};

// Validate required fields in body
export const validateRequired = (fields: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const missingFields: string[] = [];

    for (const field of fields) {
      if (!req.body[field] && req.body[field] !== 0 && req.body[field] !== false) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      throw new AppError(
        `Missing required fields: ${missingFields.join(', ')}`,
        400
      );
    }

    next();
  };
};

// Sanitize input (basic XSS prevention)
export const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    return input
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '');
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = Array.isArray(input) ? [] : {};
    for (const key in input) {
      sanitized[key] = sanitizeInput(input[key]);
    }
    return sanitized;
  }

  return input;
};

// Sanitize request body
export const sanitizeBody = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  next();
};
