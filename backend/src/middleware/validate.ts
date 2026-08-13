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

// Validate an optional start/end date pair in the body: passes if neither
// field is present (caller wants the endpoint's own default), or both are
// present as valid YYYY-MM-DD strings with end >= start. Rejects one-sided
// pairs and malformed strings early, before the request reaches a service
// that would otherwise have to re-derive the same check. This is a cheap,
// HTTP-layer guard only - the service itself remains the authoritative
// check for any non-HTTP caller (see schedulingService.findRankedAvailableSlots).
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const validateDateRangePair = (startField: string, endField: string) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const start = req.body[startField];
    const end = req.body[endField];

    if (start === undefined && end === undefined) {
      next();
      return;
    }

    if (start === undefined || end === undefined) {
      throw new AppError(`${startField} and ${endField} must both be provided, or both omitted`, 400);
    }

    if (typeof start !== 'string' || !DATE_ONLY_PATTERN.test(start)) {
      throw new AppError(`${startField} must be a YYYY-MM-DD date string`, 400);
    }
    if (typeof end !== 'string' || !DATE_ONLY_PATTERN.test(end)) {
      throw new AppError(`${endField} must be a YYYY-MM-DD date string`, 400);
    }
    if (end < start) {
      throw new AppError(`${endField} must not be before ${startField}`, 400);
    }

    next();
  };
};

// Coerce and validate numeric fields in the body. Postgres numeric/decimal
// columns come back through pg as JS strings ("60.00", not 60) - a value
// read from one query and passed straight into another request (e.g. a
// lesson's stored duration reused to prefill a new search) carries that
// string all the way into arithmetic deep in a service, where `+` silently
// string-concatenates instead of adding. Only present fields are checked -
// this composes with validateRequired for fields that must also be present.
// Unlike every other validator in this file, this one MUTATES req.body:
// on success it overwrites each field with its coerced Number(), so every
// downstream layer (controller, service) receives a guaranteed real number
// rather than a string that merely looks numeric.
export const validateNumeric = (fields: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const invalidFields: string[] = [];

    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null) {
        continue;
      }
      const coerced = Number(req.body[field]);
      if (Number.isNaN(coerced)) {
        invalidFields.push(field);
        continue;
      }
      req.body[field] = coerced;
    }

    if (invalidFields.length > 0) {
      throw new AppError(
        `Invalid numeric value for: ${invalidFields.join(', ')}`,
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
