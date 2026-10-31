import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireAdmin, requireSuperAdmin } from '../../../shared/middlewares/admin.middleware.js';
import { uploadClinicalReportFile } from '../../../shared/middlewares/clinical-report-upload.middleware.js';

export const createAdminRouter = ({ adminController, notificationController, videoController, appointmentController }) => {
  const router = Router();
  router.use(authenticateToken, requireAdmin);

  router.get('/me', adminController.getCurrentAdmin);
  router.get('/accounts', requireSuperAdmin, adminController.listAdminAccounts);
  router.post('/accounts', requireSuperAdmin, adminController.createAdminAccount);
  router.get('/appointments', appointmentController.listAdmin);
  router.post('/appointments', appointmentController.createAdmin);
  router.patch('/appointments/:appointmentId', appointmentController.updateAdmin);
  router.get('/appointments/closed-dates', appointmentController.listClosedDates);
  router.post('/appointments/closed-dates', appointmentController.createClosedDate);
  router.delete('/appointments/closed-dates/:date', appointmentController.deleteClosedDate);
  router.get('/users', adminController.listUsers);
  router.get('/users/:userId', adminController.getPatient);
  router.get('/users/:userId/archive', requireSuperAdmin, adminController.getPatientArchive);
  router.patch('/users/:userId', requireSuperAdmin, adminController.updatePatient);
  router.post('/users/:userId/reports', requireSuperAdmin, uploadClinicalReportFile, adminController.uploadPatientReport);
  router.delete('/users/:userId/reports/:reportId', requireSuperAdmin, adminController.deletePatientReport);
  router.post('/users/:userId/reports/:reportId/restore', requireSuperAdmin, adminController.restorePatientReport);
  router.patch('/users/:userId/reports/:reportId/visibility', requireSuperAdmin, adminController.updatePatientReportVisibility);
  router.get('/users/:userId/reports/:reportId/download', requireSuperAdmin, adminController.downloadPatientReport);
  router.delete('/users/:userId/assessments/:assessmentId/photos/:photoIndex', requireSuperAdmin, adminController.deletePatientScalpPhoto);
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
