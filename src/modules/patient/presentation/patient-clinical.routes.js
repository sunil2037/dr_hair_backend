import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';
import { uploadScalpPhotos } from '../../../shared/middlewares/upload.middleware.js';
import { createRateLimitStore } from '../../../shared/middlewares/rate-limit-store.js';
import { sendError } from '../../../shared/utils/response.js';

export const createPatientClinicalRouter = ({ patientClinicalController, appointmentController, treatmentController, patientAssistantController }) => {
  const router = Router();
  router.use(authenticateToken, requireRegisteredUser);

  const assistantChatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 8,
    keyGenerator: (req) => `patient:${req.user.id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: createRateLimitStore('patient-ai-chat'),
    passOnStoreError: true,
    handler: (_req, res) => sendError(res, {
      message: 'You have sent several messages. Please wait a minute before trying again.',
      statusCode: 429,
    }),
  });

  const scalpUploadFields = uploadScalpPhotos.fields([
    { name: 'photo_front', maxCount: 1 },
    { name: 'photo_top', maxCount: 1 },
    { name: 'photo_left', maxCount: 1 },
    { name: 'photo_right', maxCount: 1 },
    { name: 'photo_back', maxCount: 1 },
  ]);

  router.get('/clinical-record', patientClinicalController.getClinicalRecord);
  router.get('/home-summary', patientClinicalController.getHomeSummary);
  if (patientAssistantController?.streamChat) {
    router.post('/assistant/chat', assistantChatLimiter, patientAssistantController.streamChat);
  }
  router.get('/care-events', patientClinicalController.listCareEvents);
  router.put('/care-events', patientClinicalController.saveCareEvent);
  if (treatmentController?.getPatientDietPlan) {
    router.get('/diet-plan', treatmentController.getPatientDietPlan);
  }
  router.get('/routine-steps', patientClinicalController.getRoutineSteps);
  router.post('/routine-steps', patientClinicalController.addRoutineStep);
  router.delete('/routine-steps/:stepIndex', patientClinicalController.deleteRoutineStep);
  router.get('/reminders', patientClinicalController.getReminders);
  router.post('/reminders', patientClinicalController.saveReminder);
  router.put('/reminders/:reminderId', patientClinicalController.saveReminder);
  router.delete('/reminders/:reminderId', patientClinicalController.deleteReminder);
  router.get('/assessment/draft', patientClinicalController.getAssessmentDraft);
  router.put('/assessment/draft', patientClinicalController.saveAssessmentDraft);
  router.delete('/assessment/draft', patientClinicalController.deleteAssessmentDraft);
  router.post('/assessment/submit', scalpUploadFields, patientClinicalController.submitAssessment);

  router.get('/progress-checkins', patientClinicalController.listProgressCheckIns);
  router.post('/progress-checkins', patientClinicalController.createProgressCheckIn);
  router.delete('/progress-checkins/:checkInId', patientClinicalController.deleteProgressCheckIn);
  router.delete('/progress-checkins/:checkInId/photos/:angle', patientClinicalController.deleteProgressPhoto);
  router.get('/reports/:reportId/download', patientClinicalController.downloadReport);
  router.get('/appointments', appointmentController.listPatient);
  router.get('/appointments/billing-config', appointmentController.getBillingConfigPatient);
  router.post('/appointments', appointmentController.createPatient);
  router.post('/appointments/create-payment-intent', appointmentController.createPaymentIntent);
  router.post('/appointments/verify-and-book', appointmentController.verifyAndBook);
  router.patch('/appointments/:appointmentId', appointmentController.updatePatient);
  return router;
};
