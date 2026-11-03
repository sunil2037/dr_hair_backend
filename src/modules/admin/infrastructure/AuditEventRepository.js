import crypto from 'node:crypto';
import { isMongoConnected as isDbConnected } from '../../../shared/database/mongodb.js';
import { AuditEventModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'otp',
  'secret',
  'authorization',
  'cookie',
  'privatekey',
]);

export function redactSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveData);

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      cleaned[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      cleaned[key] = redactSensitiveData(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export class AuditEventRepository {
  async record({
    actor,
    actorId = 'system',
    actorName = 'System',
    actorEmail = '',
    actorRole = 'admin',
    target,
    targetType = '',
    action,
    details = {},
    metadata = {},
    ip = '',
    userAgent = '',
  }) {
    const id = `aud_${crypto.randomBytes(12).toString('hex')}`;
    const timestamp = new Date();

    const mergedDetails = details && Object.keys(details).length > 0 ? details : (metadata || {});
    const resolvedActor = typeof actor === 'object' && actor !== null ? String(actor.id || actor.name || actor.email || 'system') : String(actor || actorEmail || actorName || 'system');
    const resolvedActorId = typeof actor === 'object' && actor !== null && actor.id ? String(actor.id) : String(actorId);
    const resolvedTarget = typeof target === 'object' && target !== null ? String(target.id || target.name || 'system') : String(target || 'system');
    const resolvedTargetType = typeof target === 'object' && target !== null && target.type ? String(target.type) : String(targetType || '');
    const sanitizedDetails = redactSensitiveData(mergedDetails);

    const event = {
      id,
      actor: resolvedActor,
      actorId: resolvedActorId,
      actorName: String(actorName),
      actorEmail: String(actorEmail || (typeof actor === 'string' ? actor : '')),
      actorRole: String(actorRole),
      target: resolvedTarget,
      targetType: resolvedTargetType,
      action: String(action),
      details: sanitizedDetails,
      metadata: sanitizedDetails,
      ip: String(ip || ''),
      userAgent: String(userAgent || ''),
      created_at: timestamp,
    };

    if (isDbConnected()) {
      await AuditEventModel.create(event);
    } else {
      store.auditEvents.unshift(event);
      if (store.auditEvents.length > 500) {
        store.auditEvents.pop();
      }
    }

    return event;
  }

  async recordEvent(params) {
    return this.record(params);
  }

  async list({
    page = 1,
    limit = 50,
    action = null,
    actorId = null,
    target = null,
    query = null,
    startDate = null,
    endDate = null,
  } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const skip = (safePage - 1) * safeLimit;

    if (isDbConnected()) {
      const filter = {};
      if (action) filter.action = action;
      if (actorId) filter.actorId = String(actorId);
      if (target) filter.target = new RegExp(target, 'i');

      if (query) {
        const regex = new RegExp(query, 'i');
        filter.$or = [{ action: regex }, { actor: regex }, { target: regex }];
      }

      if (startDate || endDate) {
        filter.created_at = {};
        if (startDate) filter.created_at.$gte = new Date(startDate);
        if (endDate) filter.created_at.$lte = new Date(endDate);
      }

      const [items, total] = await Promise.all([
        AuditEventModel.find(filter)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(safeLimit)
          .lean(),
        AuditEventModel.countDocuments(filter),
      ]);

      return {
        items: items.map((e) => ({ ...e, details: redactSensitiveData(e.details) })),
        meta: {
          page: safePage,
          limit: safeLimit,
          total,
          total_pages: Math.ceil(total / safeLimit),
        },
      };
    }

    let filtered = [...store.auditEvents];
    if (action) filtered = filtered.filter((e) => e.action === action);
    if (actorId) filtered = filtered.filter((e) => e.actorId === String(actorId));
    if (target) {
      const t = target.toLowerCase();
      filtered = filtered.filter((e) => e.target.toLowerCase().includes(t));
    }
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.actor.toLowerCase().includes(q) ||
          e.target.toLowerCase().includes(q),
      );
    }
    if (startDate) {
      const start = new Date(startDate).getTime();
      filtered = filtered.filter((e) => new Date(e.created_at).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      filtered = filtered.filter((e) => new Date(e.created_at).getTime() <= end);
    }

    const total = filtered.length;
    const items = filtered.slice(skip, skip + safeLimit);

    return {
      items: items.map((e) => ({ ...e, details: redactSensitiveData(e.details) })),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        total_pages: Math.ceil(total / safeLimit),
      },
    };
  }

  async exportLogs(filters = {}) {
    const { items } = await this.list({ ...filters, page: 1, limit: 1000 });
    return {
      exportedAt: new Date().toISOString(),
      count: items.length,
      items: items.map((item) => ({
        id: item.id,
        timestamp: item.created_at,
        actor: item.actor,
        actorRole: item.actorRole,
        action: item.action,
        target: item.target,
        ip: item.ip,
        details: redactSensitiveData(item.details),
      })),
    };
  }
}
