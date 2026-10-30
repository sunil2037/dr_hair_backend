import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireAdmin } from '../../../shared/middlewares/admin.middleware.js';

export const createAdminRouter = ({ adminController, notificationController, videoController }) => {
  const router = Router();
  router.use(authenticateToken, requireAdmin);

  router.get('/users', adminController.listUsers);
  router.get('/hair-tests', adminController.listHairTests);
  router.get('/treatments', adminController.listTreatments);
  router.post('/treatments', adminController.createTreatment);
  router.get('/reviews', adminController.listReviews);
  router.patch('/reviews/status', adminController.updateReviewStatus);
  router.post('/notifications/send-to-user', notificationController.sendToUser);
  router.post('/media/video-upload-signature', videoController.uploadSignature);
  router.post('/media/videos', videoController.saveUploadedVideo);
  router.post('/media/videos/youtube', videoController.addYouTubeVideo);
  router.get('/media/videos', videoController.listAdmin);
  router.patch('/media/videos/status', videoController.updateStatus);

  return router;
};
