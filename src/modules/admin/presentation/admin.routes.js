import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireAdmin, requireSuperAdmin, requirePermission, requireAnyPermission } from '../../../shared/middlewares/admin.middleware.js';
import { uploadClinicalReportFile } from '../../../shared/middlewares/clinical-report-upload.middleware.js';

export const createAdminRouter = ({ adminController, notificationController, videoController, appointmentController, contentController }) => {
  const router = Router();
  router.use(authenticateToken, requireAdmin);

  router.get('/me', adminController.getCurrentAdmin);
  router.get('/accounts', requireSuperAdmin, adminController.listAdminAccounts);
  router.post('/accounts', requireSuperAdmin, adminController.createAdminAccount);

  // Clinic appointments and availability
  router.get('/appointments', requirePermission('bookings.manage'), appointmentController.listAdmin);
  router.post('/appointments', requirePermission('bookings.manage'), appointmentController.createAdmin);
  router.patch('/appointments/:appointmentId', requirePermission('bookings.manage'), appointmentController.updateAdmin);
  router.get('/appointments/closed-dates', requirePermission('bookings.manage'), appointmentController.listClosedDates);
  router.post('/appointments/closed-dates', requirePermission('bookings.manage'), appointmentController.createClosedDate);
  router.delete('/appointments/closed-dates/:date', requirePermission('bookings.manage'), appointmentController.deleteClosedDate);

  // Patients and clinical directory
  router.get('/users', requireAnyPermission('patients.view', 'patients.lookup'), adminController.listUsers);
  router.get('/users/:userId', requireAnyPermission('patients.view', 'patients.lookup'), adminController.getPatient);
  router.get('/users/:userId/archive', requireSuperAdmin, adminController.getPatientArchive);
  router.patch('/users/:userId', requireSuperAdmin, adminController.updatePatient);

  // Clinical reports
  router.post('/users/:userId/reports', requireAnyPermission('documents.upload', 'reports.approve'), uploadClinicalReportFile, adminController.uploadPatientReport);
  router.delete('/users/:userId/reports/:reportId', requireAnyPermission('documents.upload', 'reports.approve'), adminController.deletePatientReport);
  router.post('/users/:userId/reports/:reportId/restore', requireAnyPermission('documents.upload', 'reports.approve'), adminController.restorePatientReport);
  router.patch('/users/:userId/reports/:reportId/visibility', requireAnyPermission('documents.share', 'reports.share'), adminController.updatePatientReportVisibility);
  router.get('/users/:userId/reports/:reportId/download', requireAnyPermission('documents.view', 'reports.approve'), adminController.downloadPatientReport);

  // Clinical check-ins & Scalp photos
  router.patch('/users/:userId/progress-checkins/:checkInId', requireAnyPermission('progress.review', 'care-plans.edit'), adminController.reviewProgressCheckIn);
  router.delete('/users/:userId/assessments/:assessmentId/photos/:photoIndex', requireSuperAdmin, adminController.deletePatientScalpPhoto);

  // Hair tests & Assessments
  router.get('/hair-tests', requireAnyPermission('hair-tests.view', 'assessments.review'), adminController.listHairTests);
  router.patch('/hair-tests/:referenceNo/status', requireAnyPermission('assessments.review', 'hair-tests.upload'), adminController.updateHairTestStatus);

  // Care plans / treatments
  router.get('/treatments', requireAnyPermission('care-plans.edit', 'assessments.review'), adminController.listTreatments);
  router.post('/treatments', requireAnyPermission('care-plans.edit', 'assessments.review'), adminController.createTreatment);

  // Reviews
  router.get('/reviews', requireAnyPermission('content.edit', 'content.publish'), adminController.listReviews);
  router.patch('/reviews/status', requireAnyPermission('content.edit', 'content.publish'), adminController.updateReviewStatus);
  router.post('/notifications/send-to-user', requireSuperAdmin, notificationController.sendToUser);
  router.post('/notifications/broadcast', requireSuperAdmin, notificationController.broadcast);
  router.get('/notifications/history', requireSuperAdmin, notificationController.listCampaigns);
  router.get('/notifications/audience-count', requireSuperAdmin, notificationController.previewAudience);
  router.post('/notifications/campaigns/:id/cancel', requireSuperAdmin, notificationController.cancelCampaign);
  router.post('/media/video-upload-signature', requireSuperAdmin, videoController.uploadSignature);
  router.post('/media/videos/signature', requireSuperAdmin, videoController.uploadSignature);
  router.post('/media/videos', requireSuperAdmin, videoController.saveUploadedVideo);
  router.post('/media/videos/youtube', requireSuperAdmin, videoController.addYouTubeVideo);
  router.get('/media/videos', requireSuperAdmin, videoController.listAdmin);
  router.patch('/media/videos/status', requireSuperAdmin, videoController.updateStatus);
  router.delete('/media/videos/:publicId', requireSuperAdmin, videoController.deleteVideo);
  router.delete('/media/videos', requireSuperAdmin, videoController.deleteVideo);

  if (contentController) {
    router.get('/content', requireSuperAdmin, contentController.listAdmin);
    router.post('/content', requireSuperAdmin, contentController.createContent);
    router.patch('/content/:id/status', requireSuperAdmin, contentController.updateStatus);
    router.put('/content/:id', requireSuperAdmin, contentController.updateContent);
    router.delete('/content/:id', requireSuperAdmin, contentController.deleteContent);
  }

  return router;
};
