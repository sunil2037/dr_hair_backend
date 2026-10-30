import { randomBytes } from 'node:crypto';
import { BadRequestError, ConflictError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { hashPassword } from '../../../shared/utils/password-hasher.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CreateAdminAccountUseCase {
  constructor({ adminAccountRepository }) {
    this.adminAccountRepository = adminAccountRepository;
  }

  async execute({ name, email }) {
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanName || cleanName.length > 100 || !EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 254) {
      throw new BadRequestError('Enter an admin name and a valid work email.');
    }

    if (cleanEmail === config.admin.superAdminId || await this.adminAccountRepository.findByLogin(cleanEmail)) {
      throw new ConflictError('An admin account already uses that email.');
    }

    const generatedPassword = randomBytes(18).toString('base64url');
    const account = await this.adminAccountRepository.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash: await hashPassword(generatedPassword),
    });
    return { account, generatedPassword };
  }
}
