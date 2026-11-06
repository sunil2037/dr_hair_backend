import { randomBytes } from 'node:crypto';
import { BadRequestError, ConflictError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { hashPassword } from '../../../shared/utils/password-hasher.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CreateAdminAccountUseCase {
  constructor({ adminAccountRepository }) {
    this.adminAccountRepository = adminAccountRepository;
  }

  async execute({ name, email, password, roleTemplate = 'clinical-admin', permissions = [], permissionOverrides = {} }) {
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanName || cleanName.length > 100 || !EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 254) {
      throw new BadRequestError('Enter an admin name and a valid work email.');
    }

    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
        throw new BadRequestError('Password must be between 8 and 256 characters long.');
      }
    }

    if (cleanEmail === config.admin.superAdminId || await this.adminAccountRepository.findByLogin(cleanEmail)) {
      throw new ConflictError('An admin account already uses that email.');
    }

    const finalPassword = (typeof password === 'string' && password.length >= 8)
      ? password
      : randomBytes(18).toString('base64url');

    const account = await this.adminAccountRepository.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash: await hashPassword(finalPassword),
      roleTemplate,
      permissions,
      permissionOverrides,
    });
    return { account, generatedPassword: finalPassword, isCustomPassword: Boolean(password) };
  }
}
