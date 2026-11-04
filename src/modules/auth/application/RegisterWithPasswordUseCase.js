import { createHmac } from 'node:crypto';
import { BadRequestError, ConflictError } from '../../../shared/errors/index.js';
import { hashPassword } from '../../../shared/utils/password-hasher.js';
import { TokenService } from '../../../shared/utils/token.service.js';
import { config } from '../../../config/env.js';
import { isValidLogin, normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class RegisterWithPasswordUseCase {
  constructor({
    userRepository,
    otpRepository,
    sessionRepository,
    jwtSecret = config.jwt.secret,
  }) {
    this.userRepository = userRepository;
    this.otpRepository = otpRepository;
    this.sessionRepository = sessionRepository;
    this.jwtSecret = jwtSecret;
  }

  async execute({ name, email, password, phone, otp, deviceMetadata = {} }) {
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new BadRequestError('Enter a valid full name (minimum 2 characters).');
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new BadRequestError('Enter a valid email address.');
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters long.');
    }
    if (!phone || typeof phone !== 'string') {
      throw new BadRequestError('Mobile number is required for patient verification.');
    }
    if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
      throw new BadRequestError('Enter the 6-digit verification code sent to your phone.');
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = normalizeLogin(phone);
    const cleanOtp = String(otp).trim();

    if (!isValidLogin(cleanPhone) || cleanPhone.includes('@')) {
      throw new BadRequestError('Enter a valid 10-digit mobile number.');
    }

    // Check duplicate email
    const existingEmail = await this.userRepository.findByEmail(cleanEmail);
    if (existingEmail) {
      throw new ConflictError('An account with this email already exists. Please sign in.');
    }

    // Check duplicate phone
    const existingPhone = await this.userRepository.findByPhone(cleanPhone);
    if (existingPhone) {
      throw new ConflictError('An account with this mobile number already exists. Please sign in.');
    }

    // Verify OTP
    const codeHash = this._hashOtp(cleanPhone, cleanOtp);
    const otpResult = await this.otpRepository.verifyAndConsume(cleanPhone, codeHash);
    if (otpResult.status !== 'valid' && otpResult.status !== 'success') {
      if (otpResult.status === 'expired') {
        throw new BadRequestError('Verification code has expired. Please request a new one.');
      }
      throw new BadRequestError('Invalid verification code. Please check and try again.');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create patient record
    const user = await this.userRepository.create({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash,
      authProviders: ['password'],
      platform: 'app',
    });

    let session = null;
    const tokenPayload = {
      id: user.id,
      patient_code: user.patient_code,
      role: 'user',
    };

    if (this.sessionRepository) {
      session = await this.sessionRepository.create({
        userId: user.id,
        userType: 'patient',
        deviceMetadata,
      });
      tokenPayload.sessionId = session.sessionId;
    }

    const token = TokenService.generateAccessToken(tokenPayload);

    return {
      message: 'Account created successfully.',
      token,
      refreshToken: session?.refreshToken || null,
      sessionId: session?.sessionId || null,
      user: user.toPublicProfile(),
    };
  }

  _hashOtp(login, otp) {
    return createHmac('sha256', this.jwtSecret)
      .update(`${login}:${otp}`)
      .digest('hex');
  }
}
