/**
 * Express Application Setup
 * Main application configuration with middleware
 */

import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env';
import { query } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { sanitizeBody } from './middleware/validate';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  slowRequestMiddleware,
} from './middleware/loggingMiddleware';
import authRoutes from './routes/authRoutes';
import tenantRoutes from './routes/tenantRoutes';
import studentRoutes from './routes/studentRoutes';
import instructorRoutes from './routes/instructorRoutes';
import userRoutes from './routes/userRoutes';
import vehicleRoutes from './routes/vehicleRoutes';
import lessonRoutes from './routes/lessonRoutes';
import paymentRoutes from './routes/paymentRoutes';
import availabilityRoutes from './routes/availabilityRoutes';
import recurringPatternRoutes from './routes/recurringPatternRoutes';
import treasuryRoutes from './routes/treasuryRoutes';

import notificationRoutes from './routes/notifications';
import calendarFeedRoutes from './routes/calendarFeedRoutes';
import calendarFeedService from './services/calendarFeedService';

// Create Express app
const app: Application = express();

// =====================================================
// MIDDLEWARE
// =====================================================

// Security headers - must be first
app.use(helmet());

// CORS - Allow requests from frontend
app.use(
  cors({
    origin: config.ALLOWED_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    exposedHeaders: ['X-Tenant-ID'],
  })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Structured logging middleware
app.use(requestLoggingMiddleware);
app.use(slowRequestMiddleware(1000)); // Warn for requests taking > 1s

// Request logging (HTTP format for development)
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Sanitize all request bodies
app.use(sanitizeBody);

// Rate limiting - general API limiter
app.use(apiLimiter);

// =====================================================
// ROUTES
// =====================================================

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  let dbStatus = 'healthy';
  try {
    const adminCheck = await query("SELECT COUNT(*) FROM users WHERE email = 'admin@budgetdrivingschool.com'");
    if (parseInt(adminCheck.rows[0].count) === 0) {
      dbStatus = 'degraded (missing admin)';
    }
  } catch (e) {
    dbStatus = 'unreachable';
  }

  res.json({
    success: dbStatus === 'healthy',
    status: dbStatus === 'healthy' ? 'UP' : 'DEGRADED',
    message: 'Budget Driving School API is running',
    database: dbStatus,
    environment: config.NODE_ENV,
    version: config.API_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// API version prefix
const API_PREFIX = `/api/${config.API_VERSION}`;

// API Routes

// -----------------------------------------------------------------------
// PUBLIC: ICS calendar feed — no auth required, token IS the credential
// Registered FIRST so no router-level auth middleware can intercept it
// -----------------------------------------------------------------------
app.get(`${API_PREFIX}/calendar-feed/:token.ics`, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const instructor = await calendarFeedService.getInstructorByFeedToken(token);

    if (!instructor) {
      return res.status(404).send('Calendar feed not found');
    }

    const icsContent = await calendarFeedService.generateICSFeed(
      instructor.id,
      instructor.tenantId
    );

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${instructor.fullName.replace(/[^a-zA-Z0-9]/g, '_')}_lessons.ics"`
    );
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(icsContent);
  } catch (error: any) {
    console.error('Error generating calendar feed:', error);
    return res.status(500).send('Error generating calendar feed');
  }
});

app.use(`${API_PREFIX}/auth`, authLimiter, authRoutes); // Auth routes (public)
app.use(API_PREFIX, tenantRoutes);
app.use(API_PREFIX, studentRoutes);
app.use(API_PREFIX, instructorRoutes);
app.use(API_PREFIX, vehicleRoutes);
app.use(API_PREFIX, lessonRoutes);
app.use(`${API_PREFIX}/users`, userRoutes); // User management routes
app.use(API_PREFIX, paymentRoutes);
app.use(API_PREFIX, availabilityRoutes);
app.use(`${API_PREFIX}/patterns`, recurringPatternRoutes);
app.use(`${API_PREFIX}/treasury`, treasuryRoutes);

app.use(`${API_PREFIX}/notifications`, notificationRoutes);

// Authenticated calendar feed management (feed/status, feed/setup, regenerate)
app.use(`${API_PREFIX}/calendar-feed`, calendarFeedRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// =====================================================
// ERROR HANDLING
// =====================================================

// Error logging middleware (before error handler)
app.use(errorLoggingMiddleware);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
