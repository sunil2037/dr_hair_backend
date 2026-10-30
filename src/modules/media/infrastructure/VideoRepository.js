import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { VideoModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';

const orderNewestFirst = (a, b) => new Date(b.created_at) - new Date(a.created_at);

export class VideoRepository {
  async create(videoData) {
    if (isMongoConnected()) return VideoModel.create(videoData);
    const record = {
      ...videoData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.videos.unshift(record);
    return record;
  }

  async listPublished({ limit = 20, placement } = {}) {
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const placementFilter = placement ? { placement: { $in: [placement, 'both'] } } : {};
    if (isMongoConnected()) {
      return VideoModel.find({ status: 'published', ...placementFilter }).sort({ created_at: -1 }).limit(safeLimit).lean();
    }
    return store.videos
      .filter((record) => record.status === 'published' && (!placement || record.placement === placement || record.placement === 'both'))
      .sort(orderNewestFirst)
      .slice(0, safeLimit);
  }

  async listAdmin({ page = 1, limit = 25 } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    if (isMongoConnected()) {
      const [items, total] = await Promise.all([
        VideoModel.find().sort({ created_at: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
        VideoModel.countDocuments(),
      ]);
      return { items, total, page: safePage, limit: safeLimit };
    }
    const start = (safePage - 1) * safeLimit;
    return {
      items: [...store.videos].sort(orderNewestFirst).slice(start, start + safeLimit),
      total: store.videos.length,
      page: safePage,
      limit: safeLimit,
    };
  }

  async updateStatus(publicId, status) {
    if (isMongoConnected()) {
      return VideoModel.findOneAndUpdate(
        { public_id: publicId },
        { status, updated_at: new Date() },
        { new: true, runValidators: true },
      ).lean();
    }
    const record = store.videos.find((video) => video.public_id === publicId);
    if (!record) return null;
    record.status = status;
    record.updated_at = new Date().toISOString();
    return record;
  }

  async delete(publicId) {
    if (isMongoConnected()) {
      const result = await VideoModel.deleteOne({ public_id: publicId });
      return result.deletedCount > 0;
    }
    const index = store.videos.findIndex((video) => video.public_id === publicId);
    if (index === -1) return false;
    store.videos.splice(index, 1);
    return true;
  }
}
