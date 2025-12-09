/**
 * Structured Logger Utility
 * Provides consistent, structured logging across the application
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  service: string;
  environment: string;
}

class Logger {
  private service: string;
  private environment: string;

  constructor(service: string = 'budget-driving-app') {
    this.service = service;
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Format log entry as structured JSON
   */
  private formatLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      environment: this.environment,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.environment === 'development' ? error.stack : undefined,
      };
    }

    return entry;
  }

  /**
   * Output log entry to console
   */
  private output(entry: LogEntry): void {
    const logString = JSON.stringify(entry, null, this.environment === 'development' ? 2 : 0);

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logString);
        break;
      case LogLevel.INFO:
        console.info(logString);
        break;
      case LogLevel.WARN:
        console.warn(logString);
        break;
      case LogLevel.ERROR:
        console.error(logString);
        break;
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    if (this.environment === 'development') {
      const entry = this.formatLogEntry(LogLevel.DEBUG, message, context);
      this.output(entry);
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    const entry = this.formatLogEntry(LogLevel.INFO, message, context);
    this.output(entry);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    const entry = this.formatLogEntry(LogLevel.WARN, message, context);
    this.output(entry);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: LogContext): void {
    const entry = this.formatLogEntry(LogLevel.ERROR, message, context, error);
    this.output(entry);
  }

  /**
   * Create a child logger with additional context
   */
  child(childContext: LogContext): ChildLogger {
    return new ChildLogger(this, childContext);
  }
}

/**
 * Child logger that inherits parent context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private childContext: LogContext
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.childContext, ...context };
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.parent.error(message, error, this.mergeContext(context));
  }
}

/**
 * Create logger instances for different services
 */
export const createLogger = (service: string): Logger => {
  return new Logger(service);
};

// Default logger instance
export const logger = new Logger();

/**
 * Middleware logger for HTTP requests
 */
export const logRequest = (req: any): void => {
  logger.info('HTTP Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    tenantId: req.headers['x-tenant-id'],
  });
};

/**
 * Log HTTP response
 */
export const logResponse = (req: any, res: any, duration: number): void => {
  logger.info('HTTP Response', {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    tenantId: req.headers['x-tenant-id'],
  });
};

/**
 * Log database query
 */
export const logQuery = (query: string, params?: any[], duration?: number): void => {
  logger.debug('Database Query', {
    query,
    params,
    duration: duration ? `${duration}ms` : undefined,
  });
};

/**
 * Log service operation
 */
export const logServiceOperation = (
  service: string,
  operation: string,
  context?: LogContext
): void => {
  logger.info('Service Operation', {
    service,
    operation,
    ...context,
  });
};

/**
 * Log API error with full context
 */
export const logApiError = (
  error: Error,
  req: any,
  context?: LogContext
): void => {
  logger.error('API Error', error, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    tenantId: req.headers['x-tenant-id'],
    ...context,
  });
};

export default logger;
