import { BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { TokenService } from '../../../shared/utils/token.service.js';
import { hashPassword, verifyPassword } from '../../../shared/utils/password-hasher.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AdminAuthUseCase {
  constructor({ adminAccountRepository }) {
    this.adminAccountRepository = adminAccountRepository;
  }

  async execute({ email, password }) {
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

    const admin = {
      id: String(account.id),
      email: account.email,
      name: account.name,
      role: account.role,
    };
    const token = TokenService.generateToken(
      { ...admin, login: account.email, isRegistered: true },
      { expiresIn: '12h' },
    );
    return { token, admin };
  }
}
