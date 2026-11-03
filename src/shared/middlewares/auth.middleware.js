import { UnauthorizedError, ForbiddenError } from '../errors/index.js';
import { TokenService } from '../utils/token.service.js';
import { SessionRepository } from '../../modules/auth/infrastructure/SessionRepository.js';
import { AdminAccountRepository } from '../../modules/admin/infrastructure/AdminAccountRepository.js';
import { UserRepository } from '../../modules/users/infrastructure/UserRepository.js';
import { getEffectivePermissions } from '../utils/admin-permissions.js';

const sessionRepository = new SessionRepository();
const adminAccountRepository = new AdminAccountRepository();
const userRepository = new UserRepository();

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader) {
    return next(new UnauthorizedError('Authorization header missing', null, 'AUTH_REQUIRED'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return next(new UnauthorizedError('Invalid authorization format. Format must be Bearer <token>', null, 'AUTH_REQUIRED'));
  }

  const token = parts[1];
  const decoded = TokenService.verifyToken(token);

  if (!decoded) {
    return next(new UnauthorizedError('Invalid or expired authentication token', null, 'AUTH_REQUIRED'));
  }

  // Check if session has been explicitly revoked
  if (decoded.sessionId) {
    const session = await sessionRepository.findActive(decoded.sessionId);
    if (!session) {
      return next(new UnauthorizedError('Session has been revoked or expired.', null, 'AUTH_REQUIRED'));
    }
  }

  // Check if admin account is active / not suspended
  if (decoded.role === 'admin' && (decoded.email || decoded.login)) {
    const login = decoded.email || decoded.login;
    const account = await adminAccountRepository.findByLogin(login);
    if (!account || !account.active) {
      return next(new UnauthorizedError('Admin account has been suspended or deactivated.', null, 'AUTH_REQUIRED'));
    }
    decoded.permissions = getEffectivePermissions(account);
  }

  // Check if patient user account is active / not deleted / not blocked
  if (decoded.role === 'user' && decoded.id) {
    const user = await userRepository.findById(decoded.id);
    if (!user) {
      return next(new UnauthorizedError('Your account has been deleted by clinic administration.', null, 'ACCOUNT_DELETED'));
    }
    if (user.is_blocked || user.status === 'blocked') {
      return next(
        new ForbiddenError(
          'Your account has been suspended by clinic administration. To regain access, please contact Dr. Hair Clinic Support at support@drhair.in or call +91-9876543210.',
          {
            unblock_method: 'contact_support',
            support_email: 'support@drhair.in',
            support_phone: '+91-9876543210',
            blocked_reason: user.blocked_reason || 'Administrative suspension',
          },
          'ACCOUNT_BLOCKED',
        ),
      );
    }
  }

  // Attach decoded user information to request object
  req.user = decoded;
  next();
};

// Optional auth middleware (for routes where auth is optional)
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      const decoded = TokenService.verifyToken(parts[1]);
      if (decoded) {
        if (decoded.sessionId) {
          const session = await sessionRepository.findActive(decoded.sessionId);
          if (session) {
            req.user = decoded;
          }
        } else {
          req.user = decoded;
        }
      }
    }
  }
  next();
};

