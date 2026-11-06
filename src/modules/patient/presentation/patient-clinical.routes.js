import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';
import { uploadScalpPhotos } from '../../../shared/middlewares/upload.middleware.js';

export const createPatientClinicalRouter = ({ patientClinicalController, appointmentController, treatmentController }) => {
  const router = Router();
  router.use(authenticateToken, requireRegisteredUser);

  const scalpUploadFields = uploadScalpPhotos.fields([
    { name: 'photo_front', maxCount: 1 },
    { name: 'photo_top', maxCount: 1 },
    { name: 'photo_left', maxCount: 1 },
    { name: 'photo_right', maxCount: 1 },
    { name: 'photo_back', maxCount: 1 },
  ]);

  router.get('/clinical-record', patientClinicalController.getClinicalRecord);
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
  router.post('/appointments', appointmentController.createPatient);
  router.patch('/appointments/:appointmentId', appointmentController.updatePatient);
  return router;
};
