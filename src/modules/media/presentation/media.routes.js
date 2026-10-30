import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';
import { requireSuperAdmin } from '../../../shared/middlewares/admin.middleware.js';
import { uploadMediaFiles } from '../../../shared/middlewares/media-upload.middleware.js';

export const createMediaRouter = ({ mediaController }) => {
  const router = Router();
  const mediaUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  router.post(
    '/upload',
    authenticateToken,
    (req, res, next) => req.user?.role === 'super_admin'
      ? next()
      : req.user?.role === 'admin'
        ? requireSuperAdmin(req, res, next)
        : requireRegisteredUser(req, res, next),
    mediaUploadLimiter,
    uploadMediaFiles,
    mediaController.upload,
  );
  return router;
};
