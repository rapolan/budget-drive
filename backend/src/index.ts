/**
 * Server Entry Point
 * Starts the Express server and connects to database
 */

import app from './app';
import { config } from './config/env';
import pool from './config/database';

const PORT = config.PORT;

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('🚗 Budget Driving School - Backend API');
  console.log('==============================================');
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Server running on port: ${PORT}`);
  console.log(`API Base URL: http://localhost:${PORT}/api/${config.API_VERSION}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log('==============================================');
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');

  server.close(async () => {
    console.log('✅ HTTP server closed');
    try {
      await pool.end();
      console.log('✅ Database connections closed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Log unhandled rejections but do NOT crash the server
process.on('unhandledRejection', (err: any) => {
  console.error('❌ Unhandled Rejection (server continues running):', err?.message || err);
});

// Handle server-level errors (e.g., EADDRINUSE = port already in use)
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error('Run: taskkill /F /IM node.exe /T  — then restart the server.\n');
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

export default server;
