import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireSuperAdmin } from '../../../shared/middlewares/admin.middleware.js';

export const createVideoRouter = ({ videoController }) => {
  const publicRouter = Router();
  const adminRouter = Router();

  publicRouter.get('/', videoController.listPublished);

  adminRouter.use(authenticateToken, requireSuperAdmin);
  adminRouter.post('/upload-signature', videoController.uploadSignature);
  adminRouter.post('/', videoController.saveUploadedVideo);
  adminRouter.post('/youtube', videoController.addYouTubeVideo);
  adminRouter.get('/', videoController.listAdmin);
  adminRouter.patch('/status', videoController.updateStatus);

  return { publicRouter, adminRouter };
};
