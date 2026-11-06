import { DeviceTokenModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class DeviceTokenRepository {
  async register({ userId, token, platform }) {
    const now = new Date();
    const cleanUserId = userId != null && !isNaN(Number(userId)) && Number(userId) > 0 ? Number(userId) : null;
    if (isMongoConnected()) {
      const updateData = { token, platform, updated_at: now };
      if (cleanUserId !== null) {
        updateData.userId = cleanUserId;
      }
      return DeviceTokenModel.findOneAndUpdate(
        { token },
        { $set: updateData },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      ).lean();
    }
    const existing = store.deviceTokens.find((record) => record.token === token);
    if (existing) {
      if (cleanUserId !== null) existing.userId = cleanUserId;
      existing.platform = platform;
      existing.updated_at = now.toISOString();
      return existing;
    }
    const record = {
      userId: cleanUserId,
      token,
      platform,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    store.deviceTokens.push(record);
    return record;
  }

  async listByUserId(userId) {
    const numericId = Number(userId);
    if (isMongoConnected()) {
      return DeviceTokenModel.find({ userId: numericId }).lean();
    }
    return store.deviceTokens.filter((record) => record.userId === numericId);
  }

  async listAll() {
    if (isMongoConnected()) {
      return DeviceTokenModel.find().lean();
    }
    return store.deviceTokens || [];
  }

  async getAudienceUserIds(audience) {
    const cleanAudience = String(audience || 'All app users').trim();
    if (cleanAudience === 'All app users' || cleanAudience === 'all') {
      return null; // indicates all users
    }

    if (cleanAudience === 'Active patients') {
      if (isMongoConnected()) {
        const { HairTestModel, AppointmentModel, ProgressCheckInModel } = await import('../../../shared/database/models.js');
        const [testUsers, aptUsers, checkInUsers] = await Promise.all([
          HairTestModel.distinct('userId', { userId: { $ne: null } }),
          AppointmentModel.distinct('userId', { userId: { $ne: null } }),
          ProgressCheckInModel.distinct('userId', { userId: { $ne: null } }),
        ]);
        const set = new Set([...testUsers, ...aptUsers, ...checkInUsers].filter(Boolean));
        return Array.from(set);
      }
      const testUsers = (store.hairTests || []).map((t) => t.userId).filter(Boolean);
      const aptUsers = (store.appointments || []).map((a) => a.userId).filter(Boolean);
      const checkInUsers = (store.progressCheckIns || []).map((p) => p.userId).filter(Boolean);
      return Array.from(new Set([...testUsers, ...aptUsers, ...checkInUsers]));
    }

    if (cleanAudience === 'Patients with a shared report') {
      if (isMongoConnected()) {
        const { ClinicalReportModel } = await import('../../../shared/database/models.js');
        const reportUsers = await ClinicalReportModel.distinct('userId', {
          userId: { $ne: null },
          $or: [{ is_shared: true }, { visibility: 'shared' }],
        });
        return Array.from(new Set(reportUsers.filter(Boolean)));
      }
      const reportUsers = (store.clinicalReports || [])
        .filter((r) => r.is_shared === true || r.visibility === 'shared')
        .map((r) => r.userId)
        .filter(Boolean);
      return Array.from(new Set(reportUsers));
    }

    return null;
  }

  async listByAudience(audience) {
    const userIds = await this.getAudienceUserIds(audience);
    if (userIds === null) {
      return this.listAll();
    }
    if (userIds.length === 0) {
      return [];
    }

    if (isMongoConnected()) {
      return DeviceTokenModel.find({ userId: { $in: userIds } }).lean();
    }
    const idSet = new Set(userIds.map(Number));
    return (store.deviceTokens || []).filter((record) => idSet.has(Number(record.userId)));
  }

  async countByAudience(audience) {
    const tokens = await this.listByAudience(audience);
    const uniqueUsers = new Set(tokens.map((t) => Number(t.userId)).filter(Boolean));
    return {
      audience: String(audience || 'All app users'),
      tokenCount: tokens.length,
      userCount: uniqueUsers.size,
      targetCount: tokens.length,
    };
  }

  async remove({ userId, token }) {
    const numericId = userId != null && !isNaN(Number(userId)) ? Number(userId) : null;
    if (isMongoConnected()) {
      const query = { token };
      if (numericId !== null) query.userId = numericId;
      const result = await DeviceTokenModel.deleteOne(query);
      return result.deletedCount > 0;
    }
    const index = store.deviceTokens.findIndex(
      (record) => record.token === token && (numericId === null || record.userId === numericId),
    );
    if (index === -1) return false;
    store.deviceTokens.splice(index, 1);
    return true;
  }

  async removeInvalidTokens(tokens) {
    if (!tokens.length) return;
    if (isMongoConnected()) {
      await DeviceTokenModel.deleteMany({ token: { $in: tokens } });
      return;
    }
    store.deviceTokens = store.deviceTokens.filter((record) => !tokens.includes(record.token));
  }
}
