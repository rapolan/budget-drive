/**
 * Server Entry Point
 * Starts the Express server and connects to database
 */

import app from './app';
import { config } from './config/env';
import pool from './config/database';

const PORT = config.PORT;

// Start server
const server = app.listen(PORT, () => {
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

// Handle unhandled rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('❌ Unhandled Rejection:', err);
  gracefulShutdown();
});

export default server;
