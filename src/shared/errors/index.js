export class AppError extends Error {
  constructor(message, statusCode = 500, details = null, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details = null, code = 'VALIDATION_ERROR') {
    super(message, 400, details, code);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload is too large', details = null, code = 'PAYLOAD_TOO_LARGE') {
    super(message, 413, details, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access', details = null, code = 'AUTH_REQUIRED') {
    super(message, 401, details, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden access', details = null, code = 'FORBIDDEN') {
    super(message, 403, details, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details = null, code = 'CONFLICT') {
    super(message, 409, details, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null, code = 'NOT_FOUND') {
    super(message, 404, details, code);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null, code = 'VALIDATION_ERROR') {
    super(message, 422, details, code);
  }
}

export class BadGatewayError extends AppError {
  constructor(message = 'Upstream gateway error', details = null, code = 'BAD_GATEWAY') {
    super(message, 502, details, code);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details = null, code = 'PROVIDER_UNAVAILABLE') {
    super(message, 503, details, code);
  }
}

