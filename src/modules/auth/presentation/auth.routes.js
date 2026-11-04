import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { parseFormData } from '../../../shared/middlewares/upload.middleware.js';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { sendError } from '../../../shared/utils/response.js';
import { createHash } from 'node:crypto';
import { createRateLimitStore } from '../../../shared/middlewares/rate-limit-store.js';
import { normalizeLogin } from '../../../shared/utils/normalize-login.js';

const createOtpLimiter = (limit, message, namespace) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createRateLimitStore(namespace),
  passOnStoreError: true,
  handler: (req, res) => sendError(res, { message, statusCode: 429 }),
});

const createLoginLimiter = (limit, namespace, message) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createRateLimitStore(namespace),
  passOnStoreError: true,
  keyGenerator(req) {
    const login = normalizeLogin(req.body?.login || req.body?.mobile || req.body?.email || req.body?.phone || '');
    const identifier = login || 'missing-login';
    return createHash('sha256').update(identifier).digest('hex');
  },
  handler: (req, res) => sendError(res, { message, statusCode: 429 }),
});

export const createAuthRouter = ({ authController }) => {
  const router = Router();
  const sendOtpLimiter = createOtpLimiter(20, 'Too many OTP requests. Please try again in 15 minutes.', 'otp-send-ip');
  const sendOtpIdentityLimiter = createLoginLimiter(5, 'otp-send-login', 'Too many OTP requests for this account. Please try again in 15 minutes.');
  const verifyOtpLimiter = createOtpLimiter(30, 'Too many OTP verification attempts. Please try again in 15 minutes.', 'otp-verify-ip');
  const verifyOtpIdentityLimiter = createLoginLimiter(10, 'otp-verify-login', 'Too many OTP verification attempts for this account. Please request a new code later.');
  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: createRateLimitStore('auth-refresh-ip'),
    passOnStoreError: true,
    handler: (req, res) => sendError(res, {
      message: 'Too many session refresh attempts. Please try again later.',
      statusCode: 429,
    }),
  });

  const authActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 25,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: createRateLimitStore('auth-action-ip'),
    passOnStoreError: true,
    handler: (req, res) => sendError(res, {
      message: 'Too many authentication attempts. Please try again later.',
      statusCode: 429,
    }),
  });

  // Password & Social Auth Routes (Release-Ready)
  router.post('/login', authActionLimiter, parseFormData, authController.login);
  router.post('/send-signup-otp', sendOtpLimiter, parseFormData, authController.sendSignupOtp);
  router.post('/register', authActionLimiter, parseFormData, authController.register);
  router.post('/social-login', authActionLimiter, parseFormData, authController.socialLogin);
  router.post('/verify-social-signup', authActionLimiter, parseFormData, authController.verifySocialSignup);
  router.post('/forgot-password', sendOtpLimiter, parseFormData, authController.forgotPassword);
  router.post('/reset-password', authActionLimiter, parseFormData, authController.resetPassword);

  // Legacy & Flutter App routes:
  // POST /auth/send_login_otp
  router.post('/send_login_otp', sendOtpLimiter, parseFormData, sendOtpIdentityLimiter, authController.sendLoginOtp);

  // POST /auth/verify_login_otp
  router.post('/verify_login_otp', verifyOtpLimiter, parseFormData, verifyOtpIdentityLimiter, authController.verifyLoginOtp);
  router.get('/session', authenticateToken, authController.getSession);
  router.get('/me', authenticateToken, authController.getSession);
  router.post('/refresh', refreshLimiter, authController.refreshToken);
  router.post('/logout', authenticateToken, authController.logout);

  return router;
};
