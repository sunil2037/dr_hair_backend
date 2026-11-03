import { ForbiddenError } from '../errors/index.js';

export const requireAdmin = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return next(new ForbiddenError('Administrator access is required.'));
  }
  next();
};

export const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return next(new ForbiddenError('Super Admin access is required.'));
  }
  next();
};

export const requirePermission = (permissionId) => (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return next(new ForbiddenError('Administrator access is required.'));
  }
  if (req.user?.role === 'super_admin') {
    return next();
  }
  const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  if (!permissions.includes(permissionId)) {
    return next(
      new ForbiddenError(
        `Permission '${permissionId}' is required for this operation.`,
        null,
        'FORBIDDEN',
      ),
    );
  }
  next();
};

export const requireAnyPermission = (...permissionIds) => (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return next(new ForbiddenError('Administrator access is required.'));
  }
  if (req.user?.role === 'super_admin') {
    return next();
  }
  const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  const hasAny = permissionIds.some((permissionId) => permissions.includes(permissionId));
  if (!hasAny) {
    return next(
      new ForbiddenError(
        `One of permissions [${permissionIds.join(', ')}] is required for this operation.`,
        null,
        'FORBIDDEN',
      ),
    );
  }
  next();
};
