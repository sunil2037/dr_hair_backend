import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdminAuthUseCase } from '../src/modules/admin/application/AdminAuthUseCase.js';
import { CreateAdminAccountUseCase } from '../src/modules/admin/application/CreateAdminAccountUseCase.js';
import { hashPassword, verifyPassword } from '../src/shared/utils/password-hasher.js';
import { TokenService } from '../src/shared/utils/token.service.js';

describe('Password-based admin access', () => {
  it('authenticates an admin and signs a role-bearing session token', async () => {
    const passwordHash = await hashPassword('Strong-test-password-1');
    const useCase = new AdminAuthUseCase({
      adminAccountRepository: {
        findByLogin: async () => ({
          id: 'account-1',
          email: 'aisha@clinic.example',
          name: 'Aisha Khan',
          role: 'admin',
          active: true,
          passwordHash,
        }),
      },
    });

    const result = await useCase.execute({ email: 'AISHA@CLINIC.EXAMPLE', password: 'Strong-test-password-1' });
    const decoded = TokenService.verifyToken(result.token);
    assert.equal(result.admin.role, 'admin');
    assert.equal(decoded.role, 'admin');
    assert.equal(decoded.email, 'aisha@clinic.example');
  });

  it('rejects an incorrect password with the same generic auth error', async () => {
    const passwordHash = await hashPassword('Strong-test-password-1');
    const useCase = new AdminAuthUseCase({
      adminAccountRepository: {
        findByLogin: async () => ({
          id: 'account-1', email: 'aisha@clinic.example', name: 'Aisha Khan',
          role: 'admin', active: true, passwordHash,
        }),
      },
    });

    await assert.rejects(
      useCase.execute({ email: 'aisha@clinic.example', password: 'wrong-password' }),
      { name: 'UnauthorizedError', message: 'Admin ID or password is incorrect.' },
    );
  });

  it('creates an admin with a generated password stored only as a hash', async () => {
    let stored;
    const useCase = new CreateAdminAccountUseCase({
      adminAccountRepository: {
        findByLogin: async () => null,
        create: async (account) => {
          stored = account;
          return { id: 'account-2', name: account.name, email: account.email, role: 'admin', active: true };
        },
      },
    });

    const result = await useCase.execute({ name: 'Aisha Khan', email: 'Aisha@Clinic.example' });
    assert.equal(result.account.email, 'aisha@clinic.example');
    assert.equal(result.account.role, 'admin');
    assert.equal(typeof stored.passwordHash, 'string');
    assert.notEqual(stored.passwordHash, result.generatedPassword);
    assert.equal(await verifyPassword(result.generatedPassword, stored.passwordHash), true);
  });
});
