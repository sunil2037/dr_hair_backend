import { ForbiddenError } from '../errors/index.js';

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return next(new ForbiddenError('Administrator access is required.'));
  }
  next();
};
