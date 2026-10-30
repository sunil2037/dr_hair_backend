import { UnauthorizedError } from '../errors/index.js';

export const requireRegisteredUser = (req, res, next) => {
  const userId = Number(req.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return next(new UnauthorizedError('Complete your verified user profile before using this endpoint.'));
  }
  req.user.id = userId;
  next();
};
