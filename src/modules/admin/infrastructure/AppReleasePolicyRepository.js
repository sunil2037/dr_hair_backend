import { AppReleasePolicyModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

const parseSemver = (v) => {
  const parts = String(v || '').trim().split('.').map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
};

const compareSemver = (a, b) => {
  const [a1, a2, a3] = parseSemver(a);
  const [b1, b2, b3] = parseSemver(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
};

export class AppReleasePolicyRepository {
  async list() {
    if (isMongoConnected()) {
      return AppReleasePolicyModel.find().lean();
    }
    store.appReleasePolicies = store.appReleasePolicies || [];
    return [...store.appReleasePolicies];
  }

  async getByPlatform(platform = 'android') {
    const cleanPlatform = String(platform).trim().toLowerCase();
    if (isMongoConnected()) {
      return AppReleasePolicyModel.findOne({ platform: cleanPlatform }).lean();
    }
    store.appReleasePolicies = store.appReleasePolicies || [];
    return store.appReleasePolicies.find((p) => p.platform === cleanPlatform) || null;
  }

  async setPolicy(platform, updates = {}) {
    const cleanPlatform = String(platform).trim().toLowerCase();
    const now = new Date();

    if (isMongoConnected()) {
      return AppReleasePolicyModel.findOneAndUpdate(
        { platform: cleanPlatform },
        {
          $set: {
            ...updates,
            updated_at: now,
          },
          $setOnInsert: {
            created_at: now,
            minVersion: updates.minVersion || '1.0.0',
            latestVersion: updates.latestVersion || '1.0.0',
          },
        },
        { new: true, upsert: true },
      ).lean();
    }

    store.appReleasePolicies = store.appReleasePolicies || [];
    const index = store.appReleasePolicies.findIndex((p) => p.platform === cleanPlatform);
    if (index >= 0) {
      const existing = store.appReleasePolicies[index];
      const updated = {
        ...existing,
        ...updates,
        updated_at: now.toISOString(),
      };
      store.appReleasePolicies[index] = updated;
      return updated;
    }

    const created = {
      platform: cleanPlatform,
      minVersion: updates.minVersion || '1.0.0',
      latestVersion: updates.latestVersion || '1.0.0',
      forceUpdate: Boolean(updates.forceUpdate),
      maintenanceMode: Boolean(updates.maintenanceMode),
      maintenanceMessage: updates.maintenanceMessage || 'Dr. Hair is undergoing maintenance.',
      releaseNotes: updates.releaseNotes || '',
      downloadUrl: updates.downloadUrl || '',
      updatedBy: String(updates.updatedBy || 'Super Admin'),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    store.appReleasePolicies.push(created);
    return created;
  }

  async checkClientVersion({ platform = 'android', clientVersion = '1.0.0' } = {}) {
    const policy = await this.getByPlatform(platform);
    if (!policy) {
      return {
        updateRequired: false,
        updateAvailable: false,
        maintenanceMode: false,
      };
    }

    if (policy.maintenanceMode) {
      return {
        maintenanceMode: true,
        maintenanceMessage: policy.maintenanceMessage,
        updateRequired: false,
        updateAvailable: false,
      };
    }

    const cmpMin = compareSemver(clientVersion, policy.minVersion);
    const updateRequired = cmpMin < 0 || policy.forceUpdate;
    const cmpLatest = compareSemver(clientVersion, policy.latestVersion);
    const updateAvailable = cmpLatest < 0;

    return {
      maintenanceMode: false,
      updateRequired,
      updateAvailable,
      forceUpdate: Boolean(policy.forceUpdate),
      latestVersion: policy.latestVersion,
      minVersion: policy.minVersion,
      downloadUrl: policy.downloadUrl,
      releaseNotes: policy.releaseNotes,
    };
  }
}
