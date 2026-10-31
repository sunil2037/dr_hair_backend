import { AppError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';
import { config } from '../../config/env.js';

export const errorHandler = (err, req, res, next) => {
  logger.error(`${req.method} ${req.url} - Error: ${err.message}`, err.stack);

  if (err instanceof AppError) {
    return sendError(res, {
      message: err.message,
      statusCode: err.statusCode,
      details: err.details,
    });
  }

  // Multer error handling
  if (err.name === 'MulterError') {
    return sendError(res, {
      message: `File upload error: ${err.message}`,
      statusCode: err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
    });
  }

  // Unhandled error in development vs production
  const message = config.env === 'production'
    ? 'Internal Server Error' 
    : err.message || 'An unexpected error occurred';

  return sendError(res, {
    message,
    statusCode: 500,
  });
};

