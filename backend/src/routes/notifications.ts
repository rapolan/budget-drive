import express from 'express';
import pool from '../config/database';
import { notificationProcessor } from '../services/notificationProcessor';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';

const router = express.Router();

// All notification routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

/**
 * GET /api/notifications/queue
 * Get pending/sent/failed notifications
 */
router.get('/queue', async (req, res) => {
  const client = await pool.connect();
  try {
    const { status, limit = '100', offset = '0' } = req.query;
    const tenantId = req.tenantId;

    let query = `
      SELECT
        nq.*,
        l.lesson_date,
        l.start_time,
        s.full_name as student_name,
        i.full_name as instructor_name
      FROM notification_queue nq
      JOIN lessons l ON nq.lesson_id = l.id
      JOIN students s ON l.student_id = s.id
      JOIN instructors i ON l.instructor_id = i.id
      WHERE nq.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND nq.status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY nq.scheduled_send_time DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await client.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM notification_queue WHERE tenant_id = $1';
    const countParams: any[] = [tenantId];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }

    const countResult = await client.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows.map((row: any) => ({
        id: row.id,
        lessonId: row.lesson_id,
        notificationType: row.notification_type,
        recipientEmail: row.recipient_email,
        recipientType: row.recipient_type,
        scheduledSendTime: row.scheduled_send_time,
        sentAt: row.sent_at,
        status: row.status,
        attemptCount: row.attempt_count,
        lastAttemptAt: row.last_attempt_at,
        errorMessage: row.error_message,
        lessonDate: row.lesson_date,
        lessonTime: row.start_time,
        studentName: row.student_name,
        instructorName: row.instructor_name,
        createdAt: row.created_at,
      })),
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + parseInt(limit as string) < total,
      },
    });
  } catch (error: any) {
    console.error('Error fetching notification queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification queue',
      message: error.message,
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/notifications/history
 * Get notification history with stats
 */
router.get('/history', async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, limit = '100', offset = '0' } = req.query;

    // Get sent notifications
    let query = `
      SELECT
        nq.*,
        l.lesson_date,
        l.start_time,
        s.full_name as student_name,
        s.email as student_email,
        i.full_name as instructor_name,
        i.email as instructor_email
      FROM notification_queue nq
      JOIN lessons l ON nq.lesson_id = l.id
      JOIN students s ON l.student_id = s.id
      JOIN instructors i ON l.instructor_id = i.id
      WHERE nq.tenant_id = $1
      AND nq.status IN ('sent', 'failed')
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND nq.sent_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND nq.sent_at <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY nq.sent_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await client.query(query, params);

    // Get stats
    const statsResult = await client.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
        COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
        COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
        COUNT(*) as total_notifications
      FROM notification_queue
      WHERE tenant_id = $1`,
      [tenantId]
    );

    const stats = statsResult.rows[0];

    // Calculate total fees (1 sat per sent notification)
    const totalFeesSats = parseInt(stats.total_sent);
    const totalFeesUsd = totalFeesSats * 0.0000005; // Approximate

    res.json({
      success: true,
      data: result.rows.map((row: any) => ({
        id: row.id,
        lessonId: row.lesson_id,
        notificationType: row.notification_type,
        recipientEmail: row.recipient_email,
        recipientType: row.recipient_type,
        scheduledSendTime: row.scheduled_send_time,
        sentAt: row.sent_at,
        status: row.status,
        attemptCount: row.attempt_count,
        errorMessage: row.error_message,
        lessonDate: row.lesson_date,
        lessonTime: row.start_time,
        studentName: row.student_name,
        studentEmail: row.student_email,
        instructorName: row.instructor_name,
        instructorEmail: row.instructor_email,
      })),
      stats: {
        totalSent: parseInt(stats.total_sent),
        totalFailed: parseInt(stats.total_failed),
        totalPending: parseInt(stats.total_pending),
        totalNotifications: parseInt(stats.total_notifications),
        totalFeesSats,
        totalFeesUsd: parseFloat(totalFeesUsd.toFixed(10)),
      },
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error: any) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification history',
      message: error.message,
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/notifications/process
 * Manually trigger notification processor (for testing/admin)
 */
router.post('/process', async (_req, res) => {
  try {
    console.log('🔄 Manual notification processing triggered');

    // Run processor
    await notificationProcessor.processQueue();

    res.json({
      success: true,
      message: 'Notification queue processed successfully',
    });
  } catch (error: any) {
    console.error('Error processing notification queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process notification queue',
      message: error.message,
    });
  }
});

/**
 * POST /api/notifications/:id/retry
 * Retry a failed notification
 */
router.post('/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔄 Retrying notification ${id}`);

    await notificationProcessor.retryNotification(id);

    res.json({
      success: true,
      message: 'Notification retried successfully',
    });
  } catch (error: any) {
    console.error('Error retrying notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry notification',
      message: error.message,
    });
  }
});

/**
 * POST /api/notifications/test
 * Create a test notification (for development/testing)
 */
router.post('/test', async (req, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.tenantId;
    const { email, sendImmediately = false } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email address is required',
      });
      return;
    }

    // Get a random lesson for this tenant
    const lessonResult = await client.query(
      `SELECT id FROM lessons WHERE tenant_id = $1 AND status = 'scheduled' ORDER BY RANDOM() LIMIT 1`,
      [tenantId]
    );

    if (lessonResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'No scheduled lessons found for testing',
      });
      return;
    }

    const lessonId = lessonResult.rows[0].id;
    const scheduledTime = sendImmediately ? new Date() : new Date(Date.now() + 60000); // 1 minute from now

    // Create test notification
    const result = await client.query(
      `INSERT INTO notification_queue (
        tenant_id,
        lesson_id,
        notification_type,
        recipient_email,
        recipient_type,
        scheduled_send_time,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *`,
      [tenantId, lessonId, 'reminder_24h', email, 'student', scheduledTime, 'pending']
    );

    res.json({
      success: true,
      message: 'Test notification created successfully',
      data: {
        id: result.rows[0].id,
        scheduledSendTime: result.rows[0].scheduled_send_time,
        willSendIn: sendImmediately ? 'immediately (within 5 minutes)' : '1 minute',
      },
    });
  } catch (error: any) {
    console.error('Error creating test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test notification',
      message: error.message,
    });
  } finally {
    client.release();
  }
});

export default router;
