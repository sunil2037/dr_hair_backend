import { AppError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';
import { config } from '../../config/env.js';

export const errorHandler = (err, req, res, next) => {
  logger.error(`${req.method} ${req.url} - Error: ${err.message}`, err.stack);

  if (err instanceof AppError) {
    return sendError(res, {
      message: err.message,
      code: err.code || 'INTERNAL_ERROR',
      statusCode: err.statusCode,
      details: err.details,
    });
  }

  // Multer error handling
  if (err.name === 'MulterError') {
    return sendError(res, {
      message: `File upload error: ${err.message}`,
      code: err.code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR',
      statusCode: err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
    });
  }

  // Mongoose validation or cast errors
  if (err.name === 'ValidationError') {
    return sendError(res, {
      message: err.message,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: err.errors,
    });
  }
  if (err.name === 'CastError') {
    return sendError(res, {
      message: `Invalid format for field: ${err.path}`,
      code: 'INVALID_ID',
      statusCode: 400,
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

