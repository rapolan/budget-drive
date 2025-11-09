/**
 * Express Application Setup
 * Main application configuration with middleware
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { sanitizeBody } from './middleware/validate';
import tenantRoutes from './routes/tenantRoutes';
import studentRoutes from './routes/studentRoutes';
import instructorRoutes from './routes/instructorRoutes';
import vehicleRoutes from './routes/vehicleRoutes';
import lessonRoutes from './routes/lessonRoutes';
import paymentRoutes from './routes/paymentRoutes';
import availabilityRoutes from './routes/availabilityRoutes';
import calendarRoutes from './routes/calendarRoutes';
import recurringPatternRoutes from './routes/recurringPatternRoutes';

// Create Express app
const app: Application = express();

// =====================================================
// MIDDLEWARE
// =====================================================

// CORS - Allow requests from frontend
app.use(
  cors({
    origin: config.ALLOWED_ORIGINS,
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Sanitize all request bodies
app.use(sanitizeBody);

// =====================================================
// ROUTES
// =====================================================

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Budget Driving School API is running',
    environment: config.NODE_ENV,
    version: config.API_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// API version prefix
const API_PREFIX = `/api/${config.API_VERSION}`;

// API Routes
app.use(API_PREFIX, tenantRoutes);
app.use(API_PREFIX, studentRoutes);
app.use(API_PREFIX, instructorRoutes);
app.use(API_PREFIX, vehicleRoutes);
app.use(API_PREFIX, lessonRoutes);
app.use(API_PREFIX, paymentRoutes);
app.use(API_PREFIX, availabilityRoutes);
app.use(`${API_PREFIX}/calendar`, calendarRoutes);
app.use(`${API_PREFIX}/patterns`, recurringPatternRoutes);

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

// Global error handler (must be last)
app.use(errorHandler);

export default app;
