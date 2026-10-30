import { BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { TokenService } from '../../../shared/utils/token.service.js';

export class VerifyOtpUseCase {
  constructor({ otpRepository, userRepository }) {
    this.otpRepository = otpRepository;
    this.userRepository = userRepository;
  }

  async execute({ login, otp }) {
    if (!login || !otp) {
      throw new BadRequestError('Both login and 6-digit OTP code are required.');
    }

    const cleanLogin = login.trim();
    const cleanOtp = String(otp).trim();

    const storedOtp = await this.otpRepository.findByLogin(cleanLogin);

    // Also accept default test OTP in development mode
    const isTestOtpValid = process.env.NODE_ENV !== 'production' && cleanOtp === '123456';

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
          name: user.name,
          email: user.email,
          phone: user.phone,
          isRegistered: true,
        }
      : {
          login: cleanLogin,
          isRegistered: false,
        };

    const token = TokenService.generateToken(tokenPayload);

    return {
      message: 'OTP verified successfully.',
      token,
      isRegistered: !!user,
      user: user || null,
    };
  }
}

