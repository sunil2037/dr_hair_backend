import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { createRateLimitStore } from '../../../shared/middlewares/rate-limit-store.js';
import { sendError } from '../../../shared/utils/response.js';

export const createSupportRouter = ({ supportController }) => {
  const router = Router();

  const inquiryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: createRateLimitStore('support-inquiry-ip'),
    passOnStoreError: true,
    handler: (req, res) => sendError(res, {
      message: 'Too many support submissions. Please try again later.',
      statusCode: 429,
    }),
  });

  // Public / Patient inquiry submission
  router.post('/inquiries', inquiryLimiter, supportController.submitInquiry);

  return router;
};

export const createAdminSupportRouter = ({ supportController }) => {
  const router = Router();
  router.get('/support/inquiries', supportController.listInquiries);
  router.patch('/support/inquiries/:id', supportController.updateInquiry);
  return router;
};
