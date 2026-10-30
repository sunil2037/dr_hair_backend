import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';

export const createTreatmentRouter = ({ treatmentController }) => {
  const router = Router();

  // Legacy & Flutter App route:
  // GET /HairTest/get_treatment_history/:reference_no
  router.get('/get_treatment_history/:reference_no', authenticateToken, requireRegisteredUser, treatmentController.getTreatmentHistory);

  return router;
};

