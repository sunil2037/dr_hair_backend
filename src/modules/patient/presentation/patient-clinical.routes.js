import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';

export const createPatientClinicalRouter = ({ patientClinicalController, appointmentController }) => {
  const router = Router();
  router.use(authenticateToken, requireRegisteredUser);
  router.get('/clinical-record', patientClinicalController.getClinicalRecord);
  router.get('/progress-checkins', patientClinicalController.listProgressCheckIns);
  router.post('/progress-checkins', patientClinicalController.createProgressCheckIn);
  router.delete('/progress-checkins/:checkInId/photos/:angle', patientClinicalController.deleteProgressPhoto);
  router.get('/reports/:reportId/download', patientClinicalController.downloadReport);
  router.get('/appointments', appointmentController.listPatient);
  router.post('/appointments', appointmentController.createPatient);
  router.patch('/appointments/:appointmentId', appointmentController.updatePatient);
  return router;
};
