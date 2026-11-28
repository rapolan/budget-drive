/**
 * Database Configuration
 * PostgreSQL connection pool using pg library
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create PostgreSQL connection pool
//
// `options: '-c timezone=UTC'` forces every pooled connection's own
// Postgres session `timezone` setting to UTC, regardless of what the
// server's postgresql.conf happens to default to (confirmed via direct
// probe: a local dev Postgres install can default to e.g.
// 'America/Los_Angeles' from its own config file, a purely ambient,
// host-specific setting no migration or app code here ever controlled).
// This matters because every `timestamp without time zone DEFAULT now()`
// column (payments.created_at, payment_adjustments.created_at, etc.)
// stores whatever wall-clock string the SESSION's timezone produces for
// `now()` - without this, the exact same INSERT could write a different
// wall-clock value depending on which Postgres server/config it happened
// to run against. Production (Railway) already reports `Etc/UTC` for
// `SHOW timezone`, so existing rows need no migration - this just makes
// that fact an explicit, enforced guarantee rather than an unverified
// assumption shared only by coincidence between dev and prod.
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'driving_school',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  options: '-c timezone=UTC',
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Helper function to query database
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    if (process.env.LOG_LEVEL === 'debug') {
      console.log('Query executed', { text, duration, rows: res.rowCount });
    }

    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Helper to get a client from the pool (for transactions)
export const getClient = () => pool.connect();

export default pool;
