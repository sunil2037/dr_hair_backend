/**
 * Standardized API Response Helpers
 */

export const sendSuccess = (res, payload = {}, maybeMessage = null) => {
  let data = null;
  let meta = {};
  let message = null;
  let statusCode = 200;
  let extra = {};

  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    ('data' in payload || 'message' in payload || 'statusCode' in payload || 'meta' in payload)
  ) {
    data = payload.data !== undefined ? payload.data : null;
    meta = payload.meta || {};
    message = payload.message || maybeMessage || null;
    statusCode = payload.statusCode || 200;
    extra = payload.extra || {};
  } else {
    data = payload !== undefined ? payload : null;
    message = maybeMessage || null;
  }

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

export const sendCreated = (res, payload = {}, maybeMessage = null) => {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    ('data' in payload || 'message' in payload)
  ) {
    return sendSuccess(res, { ...payload, statusCode: 201 });
  }
  return sendSuccess(res, { data: payload, message: maybeMessage, statusCode: 201 });
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

