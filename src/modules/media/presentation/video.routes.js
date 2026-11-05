import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireSuperAdmin } from '../../../shared/middlewares/admin.middleware.js';

export const createVideoRouter = ({ videoController }) => {
  const publicRouter = Router();
  const adminRouter = Router();

  publicRouter.get('/categories', videoController.listCategories);
  publicRouter.get('/', videoController.listPublished);

  adminRouter.use(authenticateToken, requireSuperAdmin);
  adminRouter.post('/upload-signature', videoController.uploadSignature);
  adminRouter.post('/', videoController.saveUploadedVideo);
  adminRouter.post('/youtube', videoController.addYouTubeVideo);
  adminRouter.post('/purge-legacy', videoController.purgeLegacyVideos);
  adminRouter.get('/', videoController.listAdmin);
  adminRouter.patch('/status', videoController.updateStatus);
  adminRouter.put('/:publicId', videoController.updateVideo);
  adminRouter.patch('/:publicId', videoController.updateVideo);
  adminRouter.put('/', videoController.updateVideo);
  adminRouter.delete('/:publicId', videoController.deleteVideo);
  adminRouter.delete('/', videoController.deleteVideo);

  return { publicRouter, adminRouter };
};
