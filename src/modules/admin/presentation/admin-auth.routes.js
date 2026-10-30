import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sendError } from '../../../shared/utils/response.js';

export const createAdminAuthRouter = ({ adminAuthController }) => {
  const router = Router();
  router.post(
    '/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => sendError(res, { message: 'Too many admin login attempts. Try again later.', statusCode: 429 }),
    }),
    adminAuthController.login,
  );
  return router;
};
