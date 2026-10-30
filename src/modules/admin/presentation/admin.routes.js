import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireAdmin, requireSuperAdmin } from '../../../shared/middlewares/admin.middleware.js';

export const createAdminRouter = ({ adminController, notificationController, videoController }) => {
  const router = Router();
  router.use(authenticateToken, requireAdmin);

  router.get('/me', adminController.getCurrentAdmin);
  router.get('/accounts', requireSuperAdmin, adminController.listAdminAccounts);
  router.post('/accounts', requireSuperAdmin, adminController.createAdminAccount);
  router.get('/users', adminController.listUsers);
  router.get('/hair-tests', requireSuperAdmin, adminController.listHairTests);
  router.get('/treatments', requireSuperAdmin, adminController.listTreatments);
  router.post('/treatments', requireSuperAdmin, adminController.createTreatment);
  router.get('/reviews', requireSuperAdmin, adminController.listReviews);
  router.patch('/reviews/status', requireSuperAdmin, adminController.updateReviewStatus);
  router.post('/notifications/send-to-user', requireSuperAdmin, notificationController.sendToUser);
  router.post('/media/video-upload-signature', requireSuperAdmin, videoController.uploadSignature);
  router.post('/media/videos', requireSuperAdmin, videoController.saveUploadedVideo);
  router.post('/media/videos/youtube', requireSuperAdmin, videoController.addYouTubeVideo);
  router.get('/media/videos', requireSuperAdmin, videoController.listAdmin);
  router.patch('/media/videos/status', requireSuperAdmin, videoController.updateStatus);

  return router;
};
