import { DeviceTokenModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class DeviceTokenRepository {
  async register({ userId, token, platform }) {
    const now = new Date();
    if (isMongoConnected()) {
      return DeviceTokenModel.findOneAndUpdate(
        { token },
        { userId: Number(userId), token, platform, updated_at: now },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      ).lean();
    }
    const existing = store.deviceTokens.find((record) => record.token === token);
    if (existing) {
      Object.assign(existing, { userId: Number(userId), platform, updated_at: now.toISOString() });
      return existing;
    }
    const record = {
      userId: Number(userId),
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

  async remove({ userId, token }) {
    const numericId = Number(userId);
    if (isMongoConnected()) {
      const result = await DeviceTokenModel.deleteOne({ userId: numericId, token });
      return result.deletedCount > 0;
    }
    const index = store.deviceTokens.findIndex(
      (record) => record.userId === numericId && record.token === token,
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
