import { randomUUID } from 'node:crypto';
import { AdminAccountModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';
import { config } from '../../../config/env.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/index.js';
import { getEffectivePermissions, ROLE_TEMPLATES } from '../../../shared/utils/admin-permissions.js';

const publicAccount = (account) => {
  const roleTemplate = account.roleTemplate || (account.role === 'super_admin' ? 'super-admin' : 'clinical-admin');
  const overrides = account.permissionOverrides instanceof Map
    ? Object.fromEntries(account.permissionOverrides)
    : account.permissionOverrides || {};
  const effectivePermissions = getEffectivePermissions({
    ...account,
    roleTemplate,
    permissionOverrides: overrides,
  });

  return {
    id: String(account.id ?? account._id),
    name: account.name,
    email: account.email,
    role: account.role,
    roleTemplate,
    permissions: Array.isArray(account.permissions) ? account.permissions : [],
    permissionOverrides: overrides,
    effectivePermissions,
    active: account.active !== false,
    suspendedAt: account.suspendedAt ? new Date(account.suspendedAt).toISOString() : null,
    lastLoginAt: account.lastLoginAt ? new Date(account.lastLoginAt).toISOString() : null,
    created_at: account.created_at ? new Date(account.created_at).toISOString() : null,
  };
};

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
        roleTemplate: 'super-admin',
        permissions: [],
        permissionOverrides: {},
        active: true,
      };
    }

    if (isMongoConnected()) {
      const account = await AdminAccountModel.findOne({ email: normalized }).select('+passwordHash +permissions +permissionOverrides +roleTemplate').lean();
      return account ? { ...account, id: String(account._id) } : null;
    }

    const account = store.adminAccounts.find((item) => item.email === normalized);
    return account ? { ...account } : null;
  }

  async findById(id) {
    if (!id) return null;
    const cleanId = String(id).trim();

    if (config.admin.superAdminId && (cleanId === `bootstrap:${config.admin.superAdminId}` || cleanId === config.admin.superAdminId)) {
      return {
        id: `bootstrap:${config.admin.superAdminId}`,
        name: config.admin.superAdminName,
        email: config.admin.superAdminId,
        role: 'super_admin',
        roleTemplate: 'super-admin',
        permissions: [],
        permissionOverrides: {},
        active: true,
      };
    }

    if (isMongoConnected()) {
      const account = await AdminAccountModel.findById(cleanId).select('+passwordHash +permissions +permissionOverrides +roleTemplate').lean();
      return account ? { ...account, id: String(account._id) } : null;
    }

    const account = store.adminAccounts.find((item) => item.id === cleanId);
    return account ? { ...account } : null;
  }

  async create({
    name,
    email,
    passwordHash,
    role = 'admin',
    roleTemplate = 'clinical-admin',
    permissions = [],
    permissionOverrides = {},
  }) {
    const normalized = String(email).trim().toLowerCase();

    if (isMongoConnected()) {
      try {
        const created = await AdminAccountModel.create({
          email: normalized,
          name: String(name).trim(),
          passwordHash,
          role,
          roleTemplate,
          permissions: Array.isArray(permissions) ? permissions : [],
          permissionOverrides: permissionOverrides || {},
          active: true,
        });
        return { ...publicAccount(created.toObject()), id: String(created._id) };
      } catch (error) {
        if (error?.code === 11000) throw new ConflictError('An admin account already uses that email.');
        throw error;
      }
    }

    store.adminAccounts = store.adminAccounts || [];
    if (store.adminAccounts.some((item) => item.email === normalized)) {
      throw new ConflictError('An admin account already uses that email.');
    }

    const created = {
      id: randomUUID(),
      email: normalized,
      name: String(name).trim(),
      passwordHash,
      role,
      roleTemplate,
      permissions: Array.isArray(permissions) ? permissions : [],
      permissionOverrides: permissionOverrides || {},
      active: true,
      suspendedAt: null,
      lastLoginAt: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.adminAccounts.push(created);
    return publicAccount(created);
  }

  async update(id, updates = {}) {
    const cleanId = String(id).trim();
    const now = new Date();

    if (isMongoConnected()) {
      const doc = await AdminAccountModel.findByIdAndUpdate(
        cleanId,
        { $set: { ...updates, updated_at: now } },
        { new: true },
      ).lean();
      return doc ? publicAccount(doc) : null;
    }

    store.adminAccounts = store.adminAccounts || [];
    const index = store.adminAccounts.findIndex((item) => item.id === cleanId);
    if (index === -1) return null;

    const existing = store.adminAccounts[index];
    const updated = {
      ...existing,
      ...updates,
      updated_at: now.toISOString(),
    };
    store.adminAccounts[index] = updated;
    return publicAccount(updated);
  }

  async updateAccess(id, { roleTemplate, permissions, permissionOverrides }) {
    const account = await this.findById(id);
    if (!account) throw new NotFoundError('Admin account not found.');
    if (account.role === 'super_admin') {
      throw new ConflictError('Super Admin access cannot be altered.');
    }

    const updates = {};
    if (roleTemplate) updates.roleTemplate = roleTemplate;
    if (Array.isArray(permissions)) updates.permissions = permissions;
    if (permissionOverrides && typeof permissionOverrides === 'object') {
      updates.permissionOverrides = permissionOverrides;
    }

    return this.update(id, updates);
  }

  async suspend(id) {
    const account = await this.findById(id);
    if (!account) throw new NotFoundError('Admin account not found.');
    if (account.role === 'super_admin') {
      throw new ConflictError('Super Admin account cannot be suspended.');
    }

    return this.update(id, {
      active: false,
      suspendedAt: new Date(),
    });
  }

  async reactivate(id) {
    const account = await this.findById(id);
    if (!account) throw new NotFoundError('Admin account not found.');

    return this.update(id, {
      active: true,
      suspendedAt: null,
    });
  }

  async rotatePassword(id, passwordHash) {
    const account = await this.findById(id);
    if (!account) throw new NotFoundError('Admin account not found.');

    const now = new Date();
    if (isMongoConnected()) {
      await AdminAccountModel.findByIdAndUpdate(account.id, {
        $set: { passwordHash, updated_at: now },
      });
      return { success: true, message: 'Password rotated successfully.' };
    }

    store.adminAccounts = store.adminAccounts || [];
    const index = store.adminAccounts.findIndex((item) => item.id === account.id);
    if (index >= 0) {
      store.adminAccounts[index].passwordHash = passwordHash;
      store.adminAccounts[index].updated_at = now.toISOString();
    }
    return { success: true, message: 'Password rotated successfully.' };
  }

  async list() {
    const accounts = isMongoConnected()
      ? await AdminAccountModel.find().select('+permissions +permissionOverrides +roleTemplate name email role active suspendedAt lastLoginAt created_at').sort({ created_at: -1 }).lean()
      : [...store.adminAccounts];

    const result = accounts.map(publicAccount);
    if (config.admin.superAdminId) {
      result.unshift(publicAccount({
        id: `bootstrap:${config.admin.superAdminId}`,
        name: config.admin.superAdminName,
        email: config.admin.superAdminId,
        role: 'super_admin',
        roleTemplate: 'super-admin',
        permissions: [],
        permissionOverrides: {},
        active: true,
        created_at: null,
      }));
    }
    return result;
  }
}
