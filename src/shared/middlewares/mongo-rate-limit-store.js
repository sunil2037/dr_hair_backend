import { RateLimitCounterModel } from '../database/models.js';
import { AppError } from '../errors/index.js';

/** Persistent express-rate-limit store shared by all production instances. */
export class MongoRateLimitStore {
  constructor(namespace) {
    this.namespace = namespace;
    this.windowMs = 15 * 60 * 1000;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  key(key) {
    return `${this.namespace}:${key}`;
  }

  async failClosed(action) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof AppError) throw error;
      return undefined;
    }
  }

  async get(key) {
    return this.failClosed(async () => {
      const item = await RateLimitCounterModel.findOne({ key: this.key(key), resetTime: { $gt: new Date() } }).lean();
      return item ? { totalHits: item.totalHits, resetTime: item.resetTime } : undefined;
    });
  }

  async increment(key) {
    return this.failClosed(async () => {
      const storageKey = this.key(key);
      const now = new Date();
      const active = await RateLimitCounterModel.findOneAndUpdate(
        { key: storageKey, resetTime: { $gt: now } },
        { $inc: { totalHits: 1 } },
        { new: true },
      ).lean();
      if (active) return { totalHits: active.totalHits, resetTime: active.resetTime };

      const resetTime = new Date(now.getTime() + this.windowMs);
      const expired = await RateLimitCounterModel.findOneAndUpdate(
        { key: storageKey, resetTime: { $lte: now } },
        { $set: { totalHits: 1, resetTime } },
        { new: true },
      ).lean();
      if (expired) return { totalHits: expired.totalHits, resetTime: expired.resetTime };

      try {
        const created = await RateLimitCounterModel.create({ key: storageKey, totalHits: 1, resetTime });
        return { totalHits: created.totalHits, resetTime: created.resetTime };
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const raced = await RateLimitCounterModel.findOneAndUpdate(
          { key: storageKey, resetTime: { $gt: new Date() } },
          { $inc: { totalHits: 1 } },
          { new: true },
        ).lean();
        if (raced) return { totalHits: raced.totalHits, resetTime: raced.resetTime };
        throw error;
      }
    });
  }

  async decrement(key) {
    return this.failClosed(() => RateLimitCounterModel.updateOne(
      { key: this.key(key), totalHits: { $gt: 0 } },
      { $inc: { totalHits: -1 } },
    ));
  }

  async resetKey(key) {
    return this.failClosed(() => RateLimitCounterModel.deleteOne({ key: this.key(key) }));
  }

  async resetAll() {
    return this.failClosed(() => RateLimitCounterModel.deleteMany({ key: new RegExp(`^${this.namespace}:`) }));
  }
}
