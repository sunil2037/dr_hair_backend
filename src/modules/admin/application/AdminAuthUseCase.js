import { BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { TokenService } from '../../../shared/utils/token.service.js';
import { hashPassword, verifyPassword } from '../../../shared/utils/password-hasher.js';
import { getEffectivePermissions } from '../../../shared/utils/admin-permissions.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AdminAuthUseCase {
  constructor({ adminAccountRepository, sessionRepository }) {
    this.adminAccountRepository = adminAccountRepository;
    this.sessionRepository = sessionRepository;
  }

  async execute({ email, password, deviceMetadata = {} }) {
    const login = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (
      !login || login.length > 254 || /\s/.test(login)
      || (!EMAIL_PATTERN.test(login) && login !== config.admin.superAdminId)
      || typeof password !== 'string' || password.length < 1 || password.length > 256
    ) {
      throw new BadRequestError('Enter a valid admin email or ID and password.');
    }

    const account = await this.adminAccountRepository.findByLogin(login);
    const validPassword = account?.passwordHash
      ? await verifyPassword(password, account.passwordHash)
      : (await hashPassword(password), false);
    if (!account || !account.active || !validPassword) {
      throw new UnauthorizedError('Admin ID or password is incorrect.');
    }

    const permissions = getEffectivePermissions(account);

    let session = null;
    if (this.sessionRepository) {
      session = await this.sessionRepository.create({
        userId: String(account.id),
        userType: account.role === 'super_admin' ? 'super_admin' : 'admin',
        deviceMetadata,
      });
    }

    const admin = {
      id: String(account.id),
      email: account.email,
      name: account.name,
      role: account.role,
      roleTemplate: account.roleTemplate || (account.role === 'super_admin' ? 'super-admin' : 'clinical-admin'),
      permissions,
    };

    const tokenPayload = {
      ...admin,
      login: account.email,
      isRegistered: true,
      ...(session ? { sessionId: session.sessionId } : {}),
    };

    const token = TokenService.generateToken(tokenPayload, { expiresIn: '12h' });

    return {
      token,
      admin,
      refreshToken: session?.refreshToken || null,
      sessionId: session?.sessionId || null,
    };
  }
}
