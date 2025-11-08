/**
 * Environment Configuration
 * Centralized environment variable management with validation
 */

import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  // Server
  NODE_ENV: string;
  PORT: number;
  API_VERSION: string;

  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;

  // JWT
  JWT_SECRET: string;
  JWT_EXPIRE: string;

  // CORS
  ALLOWED_ORIGINS: string[];

  // Rate Limiting
  RATE_LIMIT_WINDOW: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Logging
  LOG_LEVEL: string;
  LOG_FILE_PATH: string;

  // Blockchain (optional for Phase 1)
  BSV_NETWORK?: string;
  TERANODE_RPC_URL?: string;
  TERANODE_API_KEY?: string;
}

const requiredEnvVars = [
  'DB_PASSWORD',
  'JWT_SECRET',
];

// Validate required environment variables
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

export const config: EnvConfig = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),
  API_VERSION: process.env.API_VERSION || 'v1',

  // Database
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432'),
  DB_NAME: process.env.DB_NAME || 'driving_school',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD!,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',

  // CORS
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001')
    .split(',')
    .map(origin => origin.trim()),

  // Rate Limiting
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW || '15'),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || 'logs/app.log',

  // Blockchain
  BSV_NETWORK: process.env.BSV_NETWORK,
  TERANODE_RPC_URL: process.env.TERANODE_RPC_URL,
  TERANODE_API_KEY: process.env.TERANODE_API_KEY,
};

export default config;
