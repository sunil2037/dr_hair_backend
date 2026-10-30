import { randomUUID } from 'node:crypto';
import { AdminAccountModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';
import { config } from '../../../config/env.js';
import { ConflictError } from '../../../shared/errors/index.js';

const publicAccount = (account) => ({
  id: String(account.id ?? account._id),
  name: account.name,
  email: account.email,
  role: account.role,
  active: account.active !== false,
  created_at: account.created_at,
});

export class AdminAccountRepository {
  async findByLogin(login) {
    const normalized = String(login || '').trim().toLowerCase();
    if (config.admin.superAdminId && normalized === config.admin.superAdminId) {
      return {
        id: `bootstrap:${config.admin.superAdminId}`,
        name: config.admin.superAdminName,
        email: config.admin.superAdminId,
        passwordHash: config.admin.superAdminPasswordHash,
        role: 'super_admin',
        active: true,
      };
    }

    if (isMongoConnected()) {
      const account = await AdminAccountModel.findOne({ email: normalized }).select('+passwordHash').lean();
      return account ? { ...account, id: String(account._id) } : null;
    }

    const account = store.adminAccounts.find((item) => item.email === normalized);
    return account ? { ...account } : null;
  }

  async create({ name, email, passwordHash }) {
    const normalized = String(email).trim().toLowerCase();
    if (isMongoConnected()) {
      try {
        const created = await AdminAccountModel.create({
          email: normalized,
          name: String(name).trim(),
          passwordHash,
          role: 'admin',
          active: true,
        });
        return { ...publicAccount(created.toObject()), id: String(created._id) };
      } catch (error) {
        if (error?.code === 11000) throw new ConflictError('An admin account already uses that email.');
        throw error;
      }
    }

    const created = {
      id: randomUUID(),
      email: normalized,
      name: String(name).trim(),
      passwordHash,
      role: 'admin',
      active: true,
      created_at: new Date().toISOString(),
    };
    store.adminAccounts.push(created);
    return publicAccount(created);
  }

  async list() {
    const accounts = isMongoConnected()
      ? await AdminAccountModel.find().select('name email role active created_at').sort({ created_at: -1 }).lean()
      : [...store.adminAccounts];
    const result = accounts.map(publicAccount);
    if (config.admin.superAdminId) {
      result.unshift({
        id: `bootstrap:${config.admin.superAdminId}`,
        name: config.admin.superAdminName,
        email: config.admin.superAdminId,
        role: 'super_admin',
        active: true,
        created_at: null,
      });
    }
    return result;
  }
}
