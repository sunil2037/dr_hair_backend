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
