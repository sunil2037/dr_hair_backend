import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';

export const createPatientClinicalRouter = ({ patientClinicalController }) => {
  const router = Router();
  router.use(authenticateToken, requireRegisteredUser);
  router.get('/clinical-record', patientClinicalController.getClinicalRecord);
  router.get('/reports/:reportId/download', patientClinicalController.downloadReport);
  return router;
};
