import { Router } from 'express';
import { parseFormData } from '../../../shared/middlewares/upload.middleware.js';
import { rateLimit } from 'express-rate-limit';
import { createRateLimitStore } from '../../../shared/middlewares/rate-limit-store.js';
import { sendError } from '../../../shared/utils/response.js';

export const createReviewRouter = ({ reviewController }) => {
  const router = Router();
  const publicCreateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: createRateLimitStore('public-review-create'),
    passOnStoreError: false,
    handler: (_req, res) => sendError(res, { message: 'Too many reviews submitted. Please try again later.', statusCode: 429 }),
  });

  // Legacy & Flutter App route:
  // POST /Review/review_get
  router.post('/review_get', parseFormData, reviewController.getReviews);
  router.get('/review_get', reviewController.getReviews);
  router.post('/create', publicCreateLimiter, parseFormData, reviewController.createReview);

  return router;
};

