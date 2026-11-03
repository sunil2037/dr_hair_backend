/**
 * Standardized API Response Helpers
 */

export const sendSuccess = (res, { data = null, meta = {}, message = null, statusCode = 200, extra = {} } = {}) => {
  const responsePayload = {
    status: 'success',
    data: data !== undefined ? data : null,
    meta: meta || {},
    error: null,
  };

  if (message) {
    responsePayload.message = message;
  }

  // Merge extra fields (e.g. token, type, etc. for legacy response compatibility)
  Object.assign(responsePayload, extra);

  return res.status(statusCode).json(responsePayload);
};

export const sendError = (res, { message = 'Internal Server Error', code = 'INTERNAL_ERROR', statusCode = 500, details = null, meta = {} } = {}) => {
  const responsePayload = {
    status: 'error',
    data: null,
    meta: meta || {},
    error: {
      code,
      message,
      details: details || null,
    },
    message,
  };

  if (details) {
    responsePayload.details = details;
  }

  return res.status(statusCode).json(responsePayload);
};

