import jwt from 'jsonwebtoken';
import { BadRequestError, ForbiddenError } from '../../../shared/errors/index.js';
import { TokenService } from '../../../shared/utils/token.service.js';
import { config } from '../../../config/env.js';

export class SocialAuthUseCase {
  constructor({
    userRepository,
    sessionRepository,
    jwtSecret = config.jwt.secret,
  }) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.jwtSecret = jwtSecret;
  }

  async execute({ provider, email, name, providerId, deviceMetadata = {} }) {
    if (!provider || !['google', 'apple'].includes(provider.toLowerCase())) {
      throw new BadRequestError('Supported social providers are "google" and "apple".');
    }
    if (!providerId || typeof providerId !== 'string') {
      throw new BadRequestError('Provider account ID is required.');
    }

    const cleanProvider = provider.toLowerCase();
    const cleanProviderId = String(providerId).trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanName = name ? String(name).trim() : 'Patient';

    // 1. Look up by provider ID
    let user = cleanProvider === 'google'
      ? await this.userRepository.findByGoogleId(cleanProviderId)
      : await this.userRepository.findByAppleId(cleanProviderId);

    // 2. If not found by provider ID, look up by verified email
    if (!user && cleanEmail) {
      user = await this.userRepository.findByEmail(cleanEmail);
      if (user) {
        // Link provider to existing user
        const updatePayload = {
          updated_at: new Date(),
        };
        if (cleanProvider === 'google' && !user.googleId) updatePayload.googleId = cleanProviderId;
        if (cleanProvider === 'apple' && !user.appleId) updatePayload.appleId = cleanProviderId;
        await this.userRepository.update(user.id, updatePayload).catch(() => {});
      }
    }

    // 3. If user exists -> authenticate directly
    if (user) {
      if (user.is_blocked || user.status === 'blocked') {
        throw new ForbiddenError(
          user.blocked_reason || 'Your account has been suspended by clinic administration.',
        );
      }

      await this.userRepository.update(user.id, { last_login_at: new Date() }).catch(() => {});

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
        is_new_user: false,
        requires_phone_verification: false,
        token,
        refreshToken: session?.refreshToken || null,
        sessionId: session?.sessionId || null,
        user: user.toPublicProfile(),
      };
    }

    // 4. New user -> Issue short-lived temporary token to complete phone verification
    const tempToken = jwt.sign(
      {
        temp_signup: true,
        provider: cleanProvider,
        providerId: cleanProviderId,
        email: cleanEmail,
        name: cleanName,
      },
      this.jwtSecret,
      { expiresIn: '15m' },
    );

    return {
      is_new_user: true,
      requires_phone_verification: true,
      temp_token: tempToken,
      email: cleanEmail,
      name: cleanName,
      provider: cleanProvider,
    };
  }
}
