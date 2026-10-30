import { Router } from 'express';
import { parseFormData } from '../../../shared/middlewares/upload.middleware.js';

export const createAuthRouter = ({ authController }) => {
  const router = Router();

  // Legacy & Flutter App routes:
  // POST /auth/send_login_otp
  router.post('/send_login_otp', parseFormData, authController.sendLoginOtp);

  // POST /auth/verify_login_otp
  router.post('/verify_login_otp', parseFormData, authController.verifyLoginOtp);

  return router;
};

