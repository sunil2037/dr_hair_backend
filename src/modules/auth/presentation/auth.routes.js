import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { parseFormData } from '../../../shared/middlewares/upload.middleware.js';
import { sendError } from '../../../shared/utils/response.js';

const createOtpLimiter = (limit, message) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => sendError(res, { message, statusCode: 429 }),
});

export const createAuthRouter = ({ authController }) => {
  const router = Router();
  const sendOtpLimiter = createOtpLimiter(5, 'Too many OTP requests. Please try again in 15 minutes.');
  const verifyOtpLimiter = createOtpLimiter(10, 'Too many OTP verification attempts. Please try again in 15 minutes.');

  // Legacy & Flutter App routes:
  // POST /auth/send_login_otp
  router.post('/send_login_otp', sendOtpLimiter, parseFormData, authController.sendLoginOtp);

  // POST /auth/verify_login_otp
  router.post('/verify_login_otp', verifyOtpLimiter, parseFormData, authController.verifyLoginOtp);

  return router;
};

