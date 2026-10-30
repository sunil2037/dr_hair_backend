import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './shared/utils/logger.js';

const { app } = createApp();

const server = app.listen(config.port, () => {
  logger.info(`=======================================================`);
  logger.info(`🚀 Dr. Hair Backend Server running in [${config.env}] mode`);
  logger.info(`📡 Server URL: http://localhost:${config.port}`);
  logger.info(`🗂️  Static Uploads: http://localhost:${config.port}/uploads/`);
  logger.info(`📋 Health check: http://localhost:${config.port}/health`);
  logger.info(`=======================================================`);
  logger.info(`Mapped Flutter Endpoints:`);
  logger.info(` - POST /auth/send_login_otp`);
  logger.info(` - POST /auth/verify_login_otp`);
  logger.info(` - POST /Admin/checkUser`);
  logger.info(` - POST /Admin/loginSignup`);
  logger.info(` - POST /Admin/get_profile`);
  logger.info(` - POST /Admin/updateProfile`);
  logger.info(` - POST /Admin/profileUpdate`);
  logger.info(` - POST /HairTest/submit_form`);
  logger.info(` - POST /HairTest/hair_test`);
  logger.info(` - GET  /HairTest/get_treatment_history/:reference_no`);
  logger.info(` - POST /Review/review_get`);
  logger.info(`=======================================================`);
});

// Graceful Shutdown
const handleShutdown = (signal) => {
  logger.info(`Received ${signal}. Gracefully shutting down HTTP server...`);
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', promise);
  logger.error('Reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', error);
  process.exit(1);
});

