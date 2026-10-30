import { Router } from 'express';
import { parseFormData } from '../../../shared/middlewares/upload.middleware.js';

export const createReviewRouter = ({ reviewController }) => {
  const router = Router();

  // Legacy & Flutter App route:
  // POST /Review/review_get
  router.post('/review_get', parseFormData, reviewController.getReviews);
  router.get('/review_get', reviewController.getReviews);
  router.post('/create', parseFormData, reviewController.createReview);

  return router;
};

