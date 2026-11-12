import { FeatureFlagModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class FeatureFlagRepository {
  async list({ platform, enabled } = {}) {
    if (isMongoConnected()) {
      const query = {};
      if (typeof enabled === 'boolean') query.enabled = enabled;
      if (platform && platform !== 'all') {
        query.$or = [{ platform }, { platform: 'all' }];
      }
      return FeatureFlagModel.find(query).sort({ group: 1, key: 1 }).lean();
    }

    store.featureFlags = store.featureFlags || [];
    let items = [...store.featureFlags];
    if (typeof enabled === 'boolean') {
      items = items.filter((f) => f.enabled === enabled);
    }
    if (platform && platform !== 'all') {
      items = items.filter((f) => f.platform === platform || f.platform === 'all');
    }
    items.sort((a, b) => a.group.localeCompare(b.group) || a.key.localeCompare(b.key));
    return items;
  }

  async findByKey(key) {
    if (!key) return null;
    const cleanKey = String(key).trim();
    if (isMongoConnected()) {
      return FeatureFlagModel.findOne({ key: cleanKey }).lean();
    }
    store.featureFlags = store.featureFlags || [];
    return store.featureFlags.find((f) => f.key === cleanKey) || null;
  }

  async setFlag(key, updates = {}) {
    const cleanKey = String(key).trim();
    const now = new Date();

    if (isMongoConnected()) {
      return FeatureFlagModel.findOneAndUpdate(
        { key: cleanKey },
        {
          $set: {
            ...updates,
            updated_at: now,
          },
          $setOnInsert: {
            created_at: now,
            title: updates.title || cleanKey,
            group: updates.group || 'General',
          },
        },
        { new: true, upsert: true },
      ).lean();
    }

    store.featureFlags = store.featureFlags || [];
    const index = store.featureFlags.findIndex((f) => f.key === cleanKey);
    if (index >= 0) {
      const existing = store.featureFlags[index];
      const updated = {
        ...existing,
        ...updates,
        updated_at: now.toISOString(),
      };
      store.featureFlags[index] = updated;
      return updated;
    }

    const created = {
      key: cleanKey,
      title: updates.title || cleanKey,
      description: updates.description || '',
      group: updates.group || 'General',
      enabled: typeof updates.enabled === 'boolean' ? updates.enabled : true,
      platform: updates.platform || 'all',
      rolloutPercentage: Number(updates.rolloutPercentage) || 100,
      effectiveDate: updates.effectiveDate ? new Date(updates.effectiveDate).toISOString() : null,
      metadata: updates.metadata || {},
      updatedBy: String(updates.updatedBy || 'Super Admin'),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    store.featureFlags.push(created);
    return created;
  }

  async getFlag(key) {
    return this.findByKey(key);
  }

  async evaluate(key, { platform = 'all' } = {}) {
    const flag = await this.findByKey(key);
    if (!flag) return { key, enabled: false, reason: 'NOT_FOUND' };
    if (!flag.enabled) return { key, enabled: false, reason: 'DISABLED' };

    if (flag.platform !== 'all' && platform !== 'all' && flag.platform !== platform) {
      return { key, enabled: false, reason: 'PLATFORM_MISMATCH' };
    }

    if (flag.effectiveDate && new Date(flag.effectiveDate).getTime() > Date.now()) {
      return { key, enabled: false, reason: 'EFFECTIVE_DATE_FUTURE' };
    }

    return { key, enabled: true, rolloutPercentage: flag.rolloutPercentage };
  }
}

