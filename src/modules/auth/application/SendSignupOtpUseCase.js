import { createHmac, randomInt } from 'node:crypto';
import { Otp } from '../domain/Otp.js';
import { BadRequestError, ConflictError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { isValidLogin, normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class SendSignupOtpUseCase {
  constructor({
    otpRepository,
    userRepository,
    smsService,
    jwtSecret = config.jwt.secret,
    expiryMinutes = config.otp.expiryMinutes,
  }) {
    this.otpRepository = otpRepository;
    this.userRepository = userRepository;
    this.smsService = smsService;
    this.jwtSecret = jwtSecret;
    this.expiryMinutes = expiryMinutes;
  }

  async execute({ phone }) {
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      throw new BadRequestError('Mobile number is required for account verification.');
    }

    const cleanPhone = normalizeLogin(phone);
    if (!isValidLogin(cleanPhone) || cleanPhone.includes('@')) {
      throw new BadRequestError('Enter a valid 10-digit mobile number.');
    }

    // Check if phone number is already registered to a patient
    const existing = await this.userRepository.findByPhone(cleanPhone);
    if (existing) {
      throw new ConflictError('This mobile number is already registered. Please sign in.');
    }

    const otpCode = String(randomInt(100000, 1000000));
    const otpHash = this._hashOtp(cleanPhone, otpCode);
    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);

    const otpEntity = new Otp({
      login: cleanPhone,
      otpHash,
      expiresAt,
      type: 'signup_verification',
    });

    await this.otpRepository.save(otpEntity);
    try {
      await this.smsService.sendOtp(cleanPhone, otpCode);
    } catch (error) {
      await this.otpRepository.delete(cleanPhone);
      throw error;
    }

    return {
      message: 'A verification code has been sent to your mobile number.',
    };
  }

  _hashOtp(login, otp) {
    return createHmac('sha256', this.jwtSecret)
      .update(`${login}:${otp}`)
      .digest('hex');
  }
}
