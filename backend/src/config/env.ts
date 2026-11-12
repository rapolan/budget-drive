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

  // Blockchain (BSV Integration - Phase 2)
  BSV_NETWORK?: string;
  BSV_PROTOCOL_WALLET_WIF?: string; // Private key for protocol wallet
  BSV_ENABLED?: boolean; // Enable BSV blockchain writes
  TAAL_API_KEY?: string; // For ARC transaction broadcasting
  TERANODE_RPC_URL?: string;
  TERANODE_API_KEY?: string;

  // Google Calendar sync (per-instructor OAuth connection)
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
  GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?: string;
  GOOGLE_OAUTH_STATE_SECRET?: string;

  // Self-service invite-code signup - the base URL the signup:invite CLI
  // builds its one-time signup link against. Already set in the
  // production environment; declared here so the running app can
  // actually read it (a deployed env var existing is independent of
  // whether this config module ever reads it).
  FRONTEND_URL: string;
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

// In production, a weak JWT_SECRET is a critical vulnerability - fail fast
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET!.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

// BSV_ENABLED=true with no configured wallet key must refuse to start, not
// silently generate one. walletService.ts's WalletService constructor used
// to fall back to PrivateKey.fromRandom() and console.log the resulting WIF
// ("SAVE THIS PRIVATE KEY") whenever no key was configured - a real private
// key logged to stdout persists indefinitely on most hosting platforms
// (including Railway, this app's deployment target), which capture and
// retain log history. A never-shown, auto-generated key is also its own
// risk (funds sent to it would be unrecoverable the moment the process
// restarts and generates a different one). The admin must deliberately
// configure BSV_PROTOCOL_WALLET_WIF themselves before BSV can be enabled -
// this is the earliest point in the app's startup where that's checkable,
// before any route binds. BSV_ENABLED=false (the current/default state) is
// completely unaffected - this branch is never reached at all in that case.
if (process.env.BSV_ENABLED === 'true' && !process.env.BSV_PROTOCOL_WALLET_WIF) {
  throw new Error(
    'BSV_ENABLED is true but BSV_PROTOCOL_WALLET_WIF is not configured. ' +
    'Set this environment variable before enabling BSV.'
  );
}

// Same conditional-requirement pattern as BSV above: an environment that
// never configures Google Calendar sync at all (GOOGLE_OAUTH_CLIENT_ID
// unset - e.g. a fresh dev clone) isn't forced to set these unrelated
// secrets, but one that DOES configure the OAuth client must also supply
// everything the feature needs to run safely, checked here at the
// earliest possible point - before any route binds - rather than failing
// opaquely the first time an instructor tries to connect or a token is
// encrypted.
if (process.env.GOOGLE_OAUTH_CLIENT_ID) {
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_CLIENT_SECRET is not configured. ' +
      'Set this environment variable before enabling Google Calendar sync.'
    );
  }
  if (!process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_REDIRECT_URI is not configured. ' +
      'Set this environment variable (must exactly match the redirect URI registered in ' +
      'Google Cloud Console) before enabling Google Calendar sync - it must never be derived ' +
      'from request headers.'
    );
  }
  if (!process.env.GOOGLE_OAUTH_STATE_SECRET) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_OAUTH_STATE_SECRET is not configured. ' +
      'Set this environment variable (a random value distinct from JWT_SECRET, e.g. via ' +
      '`openssl rand -hex 32`) before enabling Google Calendar sync.'
    );
  }
  if (!process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID is set but GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not configured. ' +
      'Set this environment variable before enabling Google Calendar sync - a stored OAuth ' +
      'token must never be written to the database unencrypted.'
    );
  }
  // The decode/length check is inlined here (rather than importing
  // utils/encryption.ts, which has no other reason to depend on this
  // module's own load order) - AES-256-GCM requires precisely a 32-byte
  // key, and a wrong-length value must fail here, at startup, not
  // opaquely the first time a token is actually encrypted.
  // encryption.ts's own getEncryptionKey() independently re-checks this
  // exact thing as the second defensive boundary, same as the BSV
  // wallet-key pattern.
  if (Buffer.from(process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY, 'hex').length !== 32) {
    throw new Error(
      'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes - ' +
      'it must be a 32-byte value in hex, e.g. via `openssl rand -hex 32`.'
    );
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
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '500'),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || 'logs/app.log',

  // Blockchain
  BSV_NETWORK: process.env.BSV_NETWORK || 'testnet',
  BSV_PROTOCOL_WALLET_WIF: process.env.BSV_PROTOCOL_WALLET_WIF,
  BSV_ENABLED: process.env.BSV_ENABLED === 'true',
  TAAL_API_KEY: process.env.TAAL_API_KEY,
  TERANODE_RPC_URL: process.env.TERANODE_RPC_URL,
  TERANODE_API_KEY: process.env.TERANODE_API_KEY,

  // Google Calendar sync
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY,
  GOOGLE_OAUTH_STATE_SECRET: process.env.GOOGLE_OAUTH_STATE_SECRET,

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};

export default config;
