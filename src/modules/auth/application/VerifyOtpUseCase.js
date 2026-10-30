import { BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { TokenService } from '../../../shared/utils/token.service.js';
import { config } from '../../../config/env.js';
import { isValidLogin, normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class VerifyOtpUseCase {
  constructor({ otpRepository, userRepository }) {
    this.otpRepository = otpRepository;
    this.userRepository = userRepository;
  }

  async execute({ login, otp }) {
    if (!login || !otp) {
      throw new BadRequestError('Both login and 6-digit OTP code are required.');
    }

    const cleanLogin = normalizeLogin(login);
    if (!isValidLogin(cleanLogin)) {
      throw new BadRequestError('Enter a valid email address or phone number.');
    }
    const cleanOtp = String(otp).trim();

    const storedOtp = await this.otpRepository.findByLogin(cleanLogin);

    // Also accept default test OTP in development mode
    const isTestOtpValid = config.isDev
      && Boolean(config.otp.defaultOtp)
      && cleanOtp === config.otp.defaultOtp;

    if (!storedOtp && !isTestOtpValid) {
      throw new UnauthorizedError('OTP expired or not requested. Please request a new OTP.');
    }

    if (storedOtp && !storedOtp.isValid(cleanOtp) && !isTestOtpValid) {
      throw new UnauthorizedError('Invalid OTP code. Please enter the correct code.');
    }

    // Clean up used OTP
    if (storedOtp) {
      await this.otpRepository.delete(cleanLogin);
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

    const token = TokenService.generateToken(tokenPayload);

    return {
      message: 'OTP verified successfully.',
      token,
      isRegistered: !!user,
      isAdmin: false,
      user: user || null,
    };
  }
}

