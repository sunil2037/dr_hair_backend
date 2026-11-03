import { createHmac, randomInt } from 'node:crypto';
import { Otp } from '../domain/Otp.js';
import { BadRequestError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { isValidLogin, normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class SendOtpUseCase {
  constructor({
    otpRepository,
    smsService,
    jwtSecret = config.jwt.secret,
    expiryMinutes = config.otp.expiryMinutes,
  }) {
    this.otpRepository = otpRepository;
    this.smsService = smsService;
    this.jwtSecret = jwtSecret;
    this.expiryMinutes = expiryMinutes;
  }

  async execute({ login }) {
    if (!login || typeof login !== 'string' || login.trim() === '') {
      throw new BadRequestError('Mobile number is required.');
    }

    const cleanLogin = normalizeLogin(login);
    if (!isValidLogin(cleanLogin)) {
      throw new BadRequestError('Enter a valid phone number for SMS OTP.');
    }
    if (cleanLogin.includes('@')) {
      throw new BadRequestError('SMS OTP is available only for phone numbers.');
    }

    const otpCode = String(randomInt(100000, 1000000));
    const otpHash = this._hashOtp(cleanLogin, otpCode);

    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);

    const otpEntity = new Otp({
      login: cleanLogin,
      otpHash,
      expiresAt,
    });

    await this.otpRepository.save(otpEntity);
    try {
      await this.smsService.sendOtp(cleanLogin, otpCode);
    } catch (error) {
      await this.otpRepository.delete(cleanLogin);
      throw error;
    }

    return {
      message: 'If this destination can receive a code, a verification code has been sent.',
    };
  }

  _hashOtp(login, otp) {
    return createHmac('sha256', this.jwtSecret)
      .update(`${login}:${otp}`)
      .digest('hex');
  }
}
