import { randomInt } from 'node:crypto';
import { Otp } from '../domain/Otp.js';
import { BadRequestError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { isValidLogin, normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class SendOtpUseCase {
  constructor({ otpRepository, userRepository, smsService }) {
    this.otpRepository = otpRepository;
    this.userRepository = userRepository;
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

    // Check if the user already exists in the system
    const existingUser = await this.userRepository.findByLogin(cleanLogin);
    const type = existingUser ? 'login' : 'register';

    // Generate 6-digit OTP (use default in dev for easy testing or random)
    const otpCode = config.isDev && config.otp.defaultOtp
      ? config.otp.defaultOtp
      : String(randomInt(100000, 1000000));

    const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

    const otpEntity = new Otp({
      login: cleanLogin,
      otp: otpCode,
      expiresAt,
      type,
    });

    await this.otpRepository.save(otpEntity);
    try {
      await this.smsService.sendOtp(cleanLogin, otpCode);
    } catch (error) {
      await this.otpRepository.delete(cleanLogin);
      throw error;
    }

    const testMessage = config.isDev && config.otp.defaultOtp
      ? ` (For testing, OTP is ${otpCode})`
      : '';

    return {
      message: `OTP sent successfully to ${cleanLogin}.${testMessage}`,
      type,
    };
  }
}

