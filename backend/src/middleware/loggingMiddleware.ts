/**
 * Logging Middleware
 * Automatically logs HTTP requests and responses with timing
 */

import { Request, Response, NextFunction } from 'express';
import { logger, logRequest, logResponse, logApiError } from '../utils/logger';
import { redactSensitive } from '../utils/redact';

/**
 * Middleware to log incoming requests and outgoing responses
 */
export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  // Log incoming request
  logRequest(req);

  // Capture original res.json to log response
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // Override res.json to log response
  res.json = function (body: any) {
    const duration = Date.now() - startTime;
    logResponse(req, res, duration);

    // Log response body in development - redacted BEFORE stringifying/
    // truncating, so a redacted key's replacement text can't itself get
    // cut off into something misleading.
    if (process.env.NODE_ENV === 'development') {
      const redactedBody = typeof body === 'object' ? redactSensitive(body) : body;
      logger.debug('Response Body', {
        path: req.path,
        body: typeof redactedBody === 'object' ? JSON.stringify(redactedBody).substring(0, 500) : redactedBody,
      });
    }

    return originalJson(body);
  };

  // Override res.send to log response
  res.send = function (body: any) {
    const duration = Date.now() - startTime;
    logResponse(req, res, duration);

    return originalSend(body);
  };

  next();
};

/**
 * Middleware to log errors
 */
export const errorLoggingMiddleware = (
  error: Error,
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Log the error with full context - body/query/params redacted first,
  // since a failed login or failed signup would otherwise log the
  // submitted plaintext password/invite code straight into Winston
  // output, which persists indefinitely on this app's hosting platform.
  logApiError(error, req, {
    body: redactSensitive(req.body),
    query: redactSensitive(req.query),
    params: redactSensitive(req.params),
  });

  // Pass error to next error handler
  next(error);
};

/**
 * Middleware to log slow requests (>1000ms)
 */
export const slowRequestMiddleware = (threshold: number = 1000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      if (duration > threshold) {
        logger.warn('Slow Request Detected', {
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          threshold: `${threshold}ms`,
          statusCode: res.statusCode,
        });
      }
    });

    next();
  };
};
