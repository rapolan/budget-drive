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

// Validate that at least one of several field groups is fully present in
// the body. Useful when an endpoint accepts more than one equivalent
// request shape (e.g. a composed scheduledStart/scheduledEnd datetime pair,
// or separate date/startTime/endTime fields) and any one complete group is
// sufficient.
export const validateRequiredOneOf = (fieldGroups: string[][]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const groupSatisfied = (fields: string[]) =>
      fields.every((field) => req.body[field] || req.body[field] === 0 || req.body[field] === false);

    if (fieldGroups.some(groupSatisfied)) {
      next();
      return;
    }

    const optionsDescription = fieldGroups.map((fields) => fields.join('+')).join(' OR ');
    throw new AppError(`Missing required fields: one of (${optionsDescription})`, 400);
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
