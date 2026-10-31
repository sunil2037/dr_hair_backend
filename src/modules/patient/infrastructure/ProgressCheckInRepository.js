import { ProgressCheckInModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class ProgressCheckInRepository {
  async createOnce(data) {
    if (isMongoConnected()) {
      const filter = { id: data.id, userId: Number(data.userId) };
      const existing = await ProgressCheckInModel.findOne(filter).lean();
      if (existing) return { item: existing, created: false };
      try {
        const created = await ProgressCheckInModel.create({ ...data, userId: Number(data.userId) });
        return { item: created.toObject(), created: true };
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const duplicate = await ProgressCheckInModel.findOne(filter).lean();
        if (!duplicate) throw error;
        return { item: duplicate, created: false };
      }
    }
    const existing = store.progressCheckIns.find((item) => item.id === data.id && Number(item.userId) === Number(data.userId));
    if (existing) return { item: existing, created: false };
    const record = { ...data, userId: Number(data.userId), created_at: new Date().toISOString() };
    store.progressCheckIns.push(record);
    return { item: record, created: true };
  }

  async listByUserId(userId) {
    const numericId = Number(userId);
    if (isMongoConnected()) {
      return ProgressCheckInModel.find({ userId: numericId }).sort({ date: -1, created_at: -1 }).lean();
    }
    return store.progressCheckIns
      .filter((item) => Number(item.userId) === numericId)
      .sort((left, right) => new Date(right.date) - new Date(left.date) || new Date(right.created_at) - new Date(left.created_at));
  }

  async removePhoto(userId, checkInId, angle) {
    const numericId = Number(userId);
    if (isMongoConnected()) {
      const filter = { userId: numericId, id: String(checkInId), 'photos.angle': angle };
      const before = await ProgressCheckInModel.findOne(filter).select('photos').lean();
      const photo = before?.photos?.find((item) => item.angle === angle);
      if (!photo) return null;
      const result = await ProgressCheckInModel.updateOne(filter, { $pull: { photos: { angle } } });
      return result.modifiedCount ? photo : null;
    }
    const record = store.progressCheckIns.find((item) => item.id === String(checkInId) && Number(item.userId) === numericId);
    if (!record) return null;
    const index = record.photos.findIndex((item) => item.angle === angle);
    if (index < 0) return null;
    return record.photos.splice(index, 1)[0];
  }

  async restorePhoto(userId, checkInId, photo) {
    const numericId = Number(userId);
    if (isMongoConnected()) {
      await ProgressCheckInModel.updateOne(
        { userId: numericId, id: String(checkInId), 'photos.angle': { $ne: photo.angle } },
        { $addToSet: { photos: photo } },
      );
      return;
    }
    const record = store.progressCheckIns.find((item) => item.id === String(checkInId) && Number(item.userId) === numericId);
    if (record && !record.photos.some((item) => item.angle === photo.angle)) record.photos.push(photo);
  }
}
