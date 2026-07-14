import dotenv from 'dotenv';
import path from 'path';

// Must run before any test module imports config/env.ts, since that module
// throws at import time if DB_PASSWORD/JWT_SECRET are missing. dotenv does
// not override already-set vars, so loading this first wins over any later
// `dotenv.config()` call inside application modules.
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
