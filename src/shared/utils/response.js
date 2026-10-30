/**
 * Standardized API Response Helpers
 */

export const sendSuccess = (res, { data = null, message = null, statusCode = 200, extra = {} } = {}) => {
  const responsePayload = {
    status: 'success',
  };

  if (message) {
    responsePayload.message = message;
  }

  if (data !== null && data !== undefined) {
    responsePayload.data = data;
  }

  // Merge extra fields (e.g. token, type, etc. for legacy response compatibility)
  Object.assign(responsePayload, extra);

  return res.status(statusCode).json(responsePayload);
};

export const sendError = (res, { message = 'Internal Server Error', statusCode = 500, details = null } = {}) => {
  const responsePayload = {
    status: 'error',
    message,
  };

  if (details) {
    responsePayload.details = details;
  }

  return res.status(statusCode).json(responsePayload);
};

