import { createHmac, randomInt } from 'node:crypto';
import { Otp } from '../domain/Otp.js';
import { AppError, BadRequestError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { isValidLogin, normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class SendOtpUseCase {
  constructor({ otpRepository, smsService }) {
    this.otpRepository = otpRepository;
    this.smsService = smsService;
  }

  async execute({ login }) {
    if (!login || typeof login !== 'string' || login.trim() === '') {
      throw new BadRequestError('Mobile number or email address is required.');
    }

    const cleanLogin = normalizeLogin(login);
    if (!isValidLogin(cleanLogin)) {
      throw new BadRequestError('Enter a valid email address or phone number.');
    }

    // The fixed code is confined to local development. Other environments use
    // an unpredictable value and require a real delivery provider.
    const otpCode = config.otp.defaultOtp
      ? config.otp.defaultOtp
      : String(randomInt(100000, 1000000));
    const otpHash = this._hashOtp(cleanLogin, otpCode);

    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

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
    return createHmac('sha256', config.jwt.secret)
      .update(`${login}:${otp}`)
      .digest('hex');
  }
}

