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

  async syncOrRepairVideos() {
    if (!isMongoConnected()) return;
    try {
      const existingCount = await VideoModel.countDocuments();
      if (existingCount === 0 && store.videos && store.videos.length > 0) {
        const cleanVideos = store.videos.filter((v) => v.provider === 'youtube');
        if (cleanVideos.length > 0) {
          await VideoModel.insertMany(cleanVideos).catch(() => {});
        }
      }
    } catch (_) {}
  }

  async purgeLegacyVideos() {
    if (isMongoConnected()) {
      const result = await VideoModel.deleteMany({
        $or: [
          { provider: 'cloudinary' },
          { provider: { $ne: 'youtube' } },
          { secure_url: { $regex: /(sample|elephants|dog|finish_line|ski_jump|football|walking)\.mp4/i } },
        ],
      });
      return { deletedCount: result.deletedCount || 0 };
    }
    const initialCount = store.videos.length;
    store.videos = store.videos.filter(
      (v) => v.provider === 'youtube' && !/(sample|elephants|dog|finish_line|ski_jump|football|walking)\.mp4/i.test(v.secure_url || '')
    );
    return { deletedCount: initialCount - store.videos.length };
  }

  async listPublished({ page = 1, limit = 10, placement, category } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (safePage - 1) * safeLimit;
    const placementFilter = placement ? { placement: { $in: [placement, 'both'] } } : {};
    const categoryFilter = category && category !== 'All' ? { category: new RegExp(`^${category}$`, 'i') } : {};

    if (isMongoConnected()) {
      await this.syncOrRepairVideos();
      const filter = { status: 'published', ...placementFilter, ...categoryFilter };
      const [items, total] = await Promise.all([
        VideoModel.find(filter).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
        VideoModel.countDocuments(filter),
      ]);
      const has_more = skip + items.length < total;
      return { items, total, page: safePage, limit: safeLimit, has_more };
    }

    const allMatching = store.videos
      .filter((record) => {
        if (record.status !== 'published') return false;
        if (placement && record.placement !== placement && record.placement !== 'both') return false;
        if (category && category !== 'All' && record.category?.toLowerCase() !== category.toLowerCase()) return false;
        return true;
      })
      .sort(orderNewestFirst);

    const total = allMatching.length;
    const items = allMatching.slice(skip, skip + safeLimit);
    const has_more = skip + items.length < total;

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      has_more,
    };
  }

  async listAdmin({ page = 1, limit = 25 } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    if (isMongoConnected()) {
      await this.syncOrRepairVideos();
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
        { $or: [{ public_id: publicId }, { youtube_video_id: publicId }, { id: publicId }] },
        { status, updated_at: new Date() },
        { new: true, runValidators: true },
      ).lean();
    }
    const record = store.videos.find((video) => video.public_id === publicId || video.youtube_video_id === publicId || video.id === publicId);
    if (!record) return null;
    record.status = status;
    record.updated_at = new Date().toISOString();
    return record;
  }

  async updateVideo(publicId, updates = {}) {
    const rawId = String(publicId).trim();
    const cleanYt = rawId.replace(/^youtube-/, '');
    const filter = {
      $or: [
        { public_id: rawId },
        { public_id: 'youtube-' + cleanYt },
        { youtube_video_id: rawId },
        { youtube_video_id: cleanYt },
        { id: rawId },
      ],
    };
    const allowed = {};
    if (updates.title) allowed.title = updates.title.trim();
    if (updates.category) {
      allowed.category = updates.category.trim();
      allowed.tag = updates.category.trim();
    }
    if (updates.description !== undefined) allowed.description = updates.description.trim();
    if (updates.placement) allowed.placement = updates.placement;
    if (updates.status) allowed.status = updates.status;
    if (updates.author_name) allowed.author_name = updates.author_name.trim();
    if (updates.author_handle) allowed.author_handle = updates.author_handle.trim();
    if (updates.treatment) allowed.treatment = updates.treatment.trim();
    if (updates.youtube_video_id) {
      allowed.youtube_video_id = updates.youtube_video_id;
      allowed.secure_url = 'https://www.youtube.com/watch?v=' + updates.youtube_video_id;
      allowed.thumbnail_url = 'https://i.ytimg.com/vi/' + updates.youtube_video_id + '/hqdefault.jpg';
    } else if (updates.secure_url) {
      allowed.secure_url = updates.secure_url;
    }
    if (updates.thumbnail_url) allowed.thumbnail_url = updates.thumbnail_url;
    allowed.updated_at = isMongoConnected() ? new Date() : new Date().toISOString();

    if (isMongoConnected()) {
      return VideoModel.findOneAndUpdate(
        filter,
        { $set: allowed },
        { new: true, runValidators: true },
      ).lean();
    }
    const record = store.videos.find(
      (video) =>
        video.public_id === rawId ||
        video.public_id === 'youtube-' + cleanYt ||
        video.youtube_video_id === rawId ||
        video.youtube_video_id === cleanYt ||
        video.id === rawId,
    );
    if (!record) return null;
    Object.assign(record, allowed);
    return record;
  }

  async delete(publicId) {
    const rawId = String(publicId).trim();
    const cleanYt = rawId.replace(/^youtube-/, '');
    const filter = {
      $or: [
        { public_id: rawId },
        { public_id: 'youtube-' + cleanYt },
        { youtube_video_id: rawId },
        { youtube_video_id: cleanYt },
        { id: rawId },
      ],
    };
    if (isMongoConnected()) {
      const result = await VideoModel.deleteOne(filter);
      return result.deletedCount > 0;
    }
    const index = store.videos.findIndex(
      (video) =>
        video.public_id === rawId ||
        video.public_id === 'youtube-' + cleanYt ||
        video.youtube_video_id === rawId ||
        video.youtube_video_id === cleanYt ||
        video.id === rawId,
    );
    if (index === -1) return false;
    store.videos.splice(index, 1);
    return true;
  }
}
