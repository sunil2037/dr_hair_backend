import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { BadRequestError, UnauthorizedError, ConflictError } from '../../../shared/errors/index.js';
import { TokenService } from '../../../shared/utils/token.service.js';
import { config } from '../../../config/env.js';
import { isValidLogin, normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class VerifySocialSignupUseCase {
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

  async execute({ tempToken, phone, otp, deviceMetadata = {} }) {
    if (!tempToken) {
      throw new UnauthorizedError('Registration token is missing or expired. Please sign in again.');
    }
    if (!phone || !otp) {
      throw new BadRequestError('Both mobile number and 6-digit OTP code are required.');
    }

    // 1. Verify temp signup token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, this.jwtSecret);
    } catch (_) {
      throw new UnauthorizedError('Registration session expired. Please start sign-in again.');
    }

    if (!decoded.temp_signup || !decoded.provider || !decoded.providerId) {
      throw new UnauthorizedError('Invalid registration session.');
    }

    const cleanPhone = normalizeLogin(phone);
    if (!isValidLogin(cleanPhone) || cleanPhone.includes('@')) {
      throw new BadRequestError('Enter a valid 10-digit mobile number.');
    }
    const cleanOtp = String(otp).trim();

    // 2. Lookup if phone already belongs to an existing patient
    const existingPhone = await this.userRepository.findByPhone(cleanPhone);

    // 3. Verify OTP
    const codeHash = this._hashOtp(cleanPhone, cleanOtp);
    const otpResult = await this.otpRepository.verifyAndConsume(cleanPhone, codeHash);
    if (otpResult.status !== 'valid' && otpResult.status !== 'success') {
      if (otpResult.status === 'expired') {
        throw new BadRequestError('Verification code has expired. Please request a new one.');
      }
      throw new BadRequestError('Invalid verification code.');
    }

    // 4. Create User or Link to existing patient record
    let user;
    if (existingPhone) {
      const updatePayload = {
        updated_at: new Date(),
      };
      if (decoded.provider === 'google' && !existingPhone.googleId) {
        updatePayload.googleId = decoded.providerId;
      }
      if (decoded.provider === 'apple' && !existingPhone.appleId) {
        updatePayload.appleId = decoded.providerId;
      }
      if (decoded.email && (!existingPhone.email || existingPhone.email.trim() === '')) {
        updatePayload.email = decoded.email;
      }
      const currentProviders = existingPhone.authProviders || ['phone'];
      if (!currentProviders.includes(decoded.provider)) {
        updatePayload.authProviders = [...currentProviders, decoded.provider];
      }
      user = await this.userRepository.update(existingPhone.id, updatePayload);
    } else {
      const userData = {
        name: decoded.name || 'Patient',
        email: decoded.email || undefined,
        phone: cleanPhone,
        authProviders: [decoded.provider],
        platform: 'app',
      };
      if (decoded.provider === 'google') userData.googleId = decoded.providerId;
      if (decoded.provider === 'apple') userData.appleId = decoded.providerId;

      user = await this.userRepository.create(userData);
    }

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
      message: 'Account verified and created successfully.',
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
