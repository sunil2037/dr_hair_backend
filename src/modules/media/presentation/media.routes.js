import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';
import { requireSuperAdmin, requireAnyPermission } from '../../../shared/middlewares/admin.middleware.js';
import { uploadMediaFiles } from '../../../shared/middlewares/media-upload.middleware.js';
import { createRateLimitStore } from '../../../shared/middlewares/rate-limit-store.js';

export const createMediaRouter = ({ mediaController }) => {
  const router = Router();
  const mediaUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: createRateLimitStore('media-upload-ip'),
    passOnStoreError: true,
  });
  const mediaUploadAccountLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: createRateLimitStore('media-upload-account'),
    passOnStoreError: true,
    keyGenerator: (req) => String(req.user?.id || 'unknown'),
  });
  router.post(
    '/upload',
    authenticateToken,
    (req, res, next) => {
      if (req.user?.role === 'super_admin' || req.user?.role === 'admin') {
        return uploadMediaFiles(req, res, next);
      }
      return requireRegisteredUser(req, res, () => {
        mediaUploadLimiter(req, res, () => {
          mediaUploadAccountLimiter(req, res, () => {
            uploadMediaFiles(req, res, next);
          });
        });
      });
    },
    mediaController.upload,
  );
  router.delete(
    '/',
    authenticateToken,
    (req, res, next) => {
      if (req.user?.role === 'super_admin' || req.user?.role === 'admin') {
        return next();
      }
      return requireRegisteredUser(req, res, () => {
        mediaUploadLimiter(req, res, () => {
          mediaUploadAccountLimiter(req, res, next);
        });
      });
    },
    mediaController.remove,
  );
  return router;
};
