import { BadRequestError, UnauthorizedError, ForbiddenError } from '../../../shared/errors/index.js';
import { verifyPassword } from '../../../shared/utils/password-hasher.js';
import { TokenService } from '../../../shared/utils/token.service.js';

export class LoginWithPasswordUseCase {
  constructor({ userRepository, sessionRepository }) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
  }

  async execute({ email, password, deviceMetadata = {} }) {
    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new BadRequestError('Email address is required.');
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      throw new BadRequestError('Password is required.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findWithPasswordByEmail(cleanEmail);

    if (!user) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (user.is_blocked || user.status === 'blocked') {
      throw new ForbiddenError(
        user.blocked_reason || 'Your account has been suspended by clinic administration.',
      );
    }

    if (!user.passwordHash) {
      throw new BadRequestError(
        'This account was registered using social login or mobile verification. Please sign in with Google/Apple or reset your password.',
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    // Update last login timestamp
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
      message: 'Signed in successfully.',
      token,
      refreshToken: session?.refreshToken || null,
      sessionId: session?.sessionId || null,
      user: user.toPublicProfile(),
    };
  }
}
