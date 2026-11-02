import { RateLimitCounterModel } from '../database/models.js';

/** Persistent express-rate-limit store shared by all production instances with in-memory fallback. */
export class MongoRateLimitStore {
  constructor(namespace) {
    this.namespace = namespace;
    this.windowMs = 15 * 60 * 1000;
    this.localKeys = false;
    this.fallback = new Map();
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  key(key) {
    return `${this.namespace}:${key}`;
  }

  _fallbackIncrement(storageKey) {
    const now = Date.now();
    let entry = this.fallback.get(storageKey);
    if (!entry || entry.resetTime.getTime() <= now) {
      entry = { totalHits: 1, resetTime: new Date(now + this.windowMs) };
    } else {
      entry.totalHits += 1;
    }
    this.fallback.set(storageKey, entry);
    return { totalHits: entry.totalHits, resetTime: entry.resetTime };
  }

  async get(key) {
    const storageKey = this.key(key);
    try {
      const item = await RateLimitCounterModel.findOne({ key: storageKey, resetTime: { $gt: new Date() } }).lean();
      return item ? { totalHits: item.totalHits, resetTime: item.resetTime } : undefined;
    } catch {
      return this.fallback.get(storageKey);
    }
  }

  async increment(key) {
    const storageKey = this.key(key);
    try {
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
    } catch {
      return this._fallbackIncrement(storageKey);
    }
  }

  async decrement(key) {
    const storageKey = this.key(key);
    try {
      await RateLimitCounterModel.updateOne(
        { key: storageKey, totalHits: { $gt: 0 } },
        { $inc: { totalHits: -1 } },
      );
    } catch {
      const entry = this.fallback.get(storageKey);
      if (entry && entry.totalHits > 0) entry.totalHits -= 1;
    }
  }

  async resetKey(key) {
    const storageKey = this.key(key);
    try {
      await RateLimitCounterModel.deleteOne({ key: storageKey });
    } catch {
      this.fallback.delete(storageKey);
    }
  }

  async resetAll() {
    try {
      await RateLimitCounterModel.deleteMany({ key: new RegExp(`^${this.namespace}:`) });
    } catch {
      this.fallback.clear();
    }
  }
}
