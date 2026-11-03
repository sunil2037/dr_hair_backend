import { createHmac } from 'node:crypto';
import { BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { TokenService } from '../../../shared/utils/token.service.js';
import { config } from '../../../config/env.js';
import { isValidLogin, normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class VerifyOtpUseCase {
  constructor({ otpRepository, userRepository, sessionRepository }) {
    this.otpRepository = otpRepository;
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
  }

  async execute({ login, otp, deviceMetadata = {} }) {
    if (!login || !otp) {
      throw new BadRequestError('Both login and 6-digit OTP code are required.');
    }

    const cleanLogin = normalizeLogin(login);
    if (!isValidLogin(cleanLogin)) {
      throw new BadRequestError('Enter a valid email address or phone number.');
    }
    const cleanOtp = String(otp).trim();
    if (!/^\d{6}$/.test(cleanOtp)) throw new BadRequestError('OTP must contain exactly 6 digits.');

    const otpHash = createHmac('sha256', config.jwt.secret)
      .update(`${cleanLogin}:${cleanOtp}`)
      .digest('hex');

    let verification = await this.otpRepository.verifyAndConsume(cleanLogin, otpHash, 5);
    // Allow test OTP verification ONLY in local development and when explicitly configured.
    // In production or outside local dev, config.isDev is false and test codes are never valid.
    if (config.isDev && config.otp.defaultOtp && verification.status !== 'valid' && cleanOtp === config.otp.defaultOtp) {
      const activeOtp = await this.otpRepository.findByLogin(cleanLogin);
      if (activeOtp && activeOtp.expiresAt > new Date()) {
        await this.otpRepository.delete(cleanLogin);
        verification = { status: 'valid' };
      }
    }

    if (verification.status === 'locked') {
      throw new UnauthorizedError('Too many incorrect OTP attempts. Request a new code.');
    }
    if (verification.status !== 'valid') {
      if (verification.status === 'invalid') {
        throw new UnauthorizedError(`Invalid OTP code. ${verification.attemptsRemaining} attempt(s) remaining.`);
      }
      throw new UnauthorizedError('OTP expired or not requested. Please request a new OTP.');
    }

    // Check if user exists in database
    const user = await this.userRepository.findByLogin(cleanLogin);
    // Generate JWT auth token
    const tokenPayload = user
      ? {
          id: user.id,
          login: cleanLogin,
          name: user.name,
          email: user.email,
          phone: user.phone,
          isRegistered: true,
          // Admin accounts use the password-based admin auth module only.
          role: 'user',
        }
      : {
          login: cleanLogin,
          isRegistered: false,
          role: 'user',
        };

    let session = null;
    if (this.sessionRepository) {
      session = await this.sessionRepository.create({
        // Keep a new patient's OTP session revocable during profile
        // completion. It is replaced with the real patient session after
        // registration.
        userId: user ? user.id : `pending:${cleanLogin}`,
        userType: 'patient',
        deviceMetadata,
      });
      tokenPayload.sessionId = session.sessionId;
    }

    const token = TokenService.generateAccessToken(tokenPayload);

    return {
      message: 'OTP verified successfully.',
      token,
      refreshToken: session?.refreshToken || null,
      sessionId: session?.sessionId || null,
      isRegistered: !!user,
      isAdmin: false,
      user: user || null,
    };
  }
}
