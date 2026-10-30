import { UnauthorizedError } from '../errors/index.js';
import { TokenService } from '../utils/token.service.js';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader) {
    return next(new UnauthorizedError('Authorization header missing'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return next(new UnauthorizedError('Invalid authorization format. Format must be Bearer <token>'));
  }

  const token = parts[1];
  const decoded = TokenService.verifyToken(token);

  if (!decoded) {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }

  // Attach decoded user information to request object
  req.user = decoded;
  next();
};

// Optional auth middleware (for routes where auth is optional)
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      const decoded = TokenService.verifyToken(parts[1]);
      if (decoded) {
        req.user = decoded;
      }
    }
  }
  next();
};

