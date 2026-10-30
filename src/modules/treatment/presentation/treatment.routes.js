import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';

export const createTreatmentRouter = ({ treatmentController }) => {
  const router = Router();

  // Legacy & Flutter App route:
  // GET /HairTest/get_treatment_history/:reference_no
  router.get('/get_treatment_history/:reference_no', authenticateToken, treatmentController.getTreatmentHistory);
  router.get('/get_treatment_history/:id', authenticateToken, treatmentController.getTreatmentHistory);

  return router;
};

