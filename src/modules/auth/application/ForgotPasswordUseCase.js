import { createHmac, randomInt } from 'node:crypto';
import { Otp } from '../domain/Otp.js';
import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class ForgotPasswordUseCase {
  constructor({
    userRepository,
    otpRepository,
    smsService,
    jwtSecret = config.jwt.secret,
    expiryMinutes = config.otp.expiryMinutes,
  }) {
    this.userRepository = userRepository;
    this.otpRepository = otpRepository;
    this.smsService = smsService;
    this.jwtSecret = jwtSecret;
    this.expiryMinutes = expiryMinutes;
  }

  async execute({ login }) {
    if (!login || typeof login !== 'string' || !login.trim()) {
      throw new BadRequestError('Registered email address or mobile number is required.');
    }

    const cleanLogin = normalizeLogin(login);
    const user = await this.userRepository.findByLogin(cleanLogin);
    if (!user) {
      // Return safe message without leaking user existence
      return {
        message: 'If an account exists with this destination, a reset code has been dispatched.',
      };
    }

    const phoneDestination = user.phone;
    if (!phoneDestination) {
      throw new BadRequestError('No verified mobile number on file for password reset.');
    }

    const otpCode = String(randomInt(100000, 1000000));
    const otpHash = this._hashOtp(phoneDestination, otpCode);
    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);

    const otpEntity = new Otp({
      login: phoneDestination,
      otpHash,
      expiresAt,
      type: 'password_reset',
    });

    await this.otpRepository.save(otpEntity);
    try {
      await this.smsService.sendOtp(phoneDestination, otpCode);
    } catch (_) {}

    return {
      message: 'If an account exists with this destination, a reset code has been dispatched.',
      destination: phoneDestination.slice(-4),
    };
  }

  _hashOtp(login, otp) {
    return createHmac('sha256', this.jwtSecret)
      .update(`${login}:${otp}`)
      .digest('hex');
  }
}
