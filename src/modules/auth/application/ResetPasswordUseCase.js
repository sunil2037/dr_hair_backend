import { createHmac } from 'node:crypto';
import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { hashPassword } from '../../../shared/utils/password-hasher.js';
import { config } from '../../../config/env.js';
import { normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class ResetPasswordUseCase {
  constructor({
    userRepository,
    otpRepository,
    jwtSecret = config.jwt.secret,
  }) {
    this.userRepository = userRepository;
    this.otpRepository = otpRepository;
    this.jwtSecret = jwtSecret;
  }

  async execute({ login, otp, newPassword }) {
    if (!login || !otp || !newPassword) {
      throw new BadRequestError('Login identifier, 6-digit code, and new password are required.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      throw new BadRequestError('New password must be at least 6 characters long.');
    }

    const cleanLogin = normalizeLogin(login);
    const user = await this.userRepository.findByLogin(cleanLogin);
    if (!user) {
      throw new NotFoundError('Account not found.');
    }

    const phoneDestination = user.phone;
    if (!phoneDestination) {
      throw new BadRequestError('No verified mobile number on file.');
    }

    const cleanOtp = String(otp).trim();
    const codeHash = this._hashOtp(phoneDestination, cleanOtp);

    const otpResult = await this.otpRepository.verifyAndConsume(phoneDestination, codeHash);
    if (otpResult.status !== 'valid' && otpResult.status !== 'success') {
      if (otpResult.status === 'expired') {
        throw new BadRequestError('Reset code has expired. Please request a new one.');
      }
      throw new BadRequestError('Invalid reset code. Please check and try again.');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.userRepository.setPassword(user.id, passwordHash);

    return {
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.',
    };
  }

  _hashOtp(login, otp) {
    return createHmac('sha256', this.jwtSecret)
      .update(`${login}:${otp}`)
      .digest('hex');
  }
}
