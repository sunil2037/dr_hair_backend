import crypto from 'node:crypto';
import { isMongoConnected as isDbConnected } from '../../../shared/database/mongodb.js';
import { AuditEventModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';

export class AuditEventRepository {
  async record({
    actorId = 'system',
    actorName = 'System',
    actorEmail = '',
    actorRole = 'admin',
    target,
    targetType = '',
    action,
    details = {},
    ip = '',
    userAgent = '',
  }) {
    const id = `aud_${crypto.randomBytes(12).toString('hex')}`;
    const timestamp = new Date();

    const event = {
      id,
      actorId: String(actorId),
      actorName: String(actorName),
      actorEmail: String(actorEmail),
      actorRole: String(actorRole),
      target: String(target || 'system'),
      targetType: String(targetType || ''),
      action: String(action),
      details: details || {},
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

  async list({ page = 1, limit = 50, action = null, actorId = null, target = null } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const skip = (safePage - 1) * safeLimit;

    if (isDbConnected()) {
      const filter = {};
      if (action) filter.action = action;
      if (actorId) filter.actorId = String(actorId);
      if (target) filter.target = new RegExp(target, 'i');

      const [items, total] = await Promise.all([
        AuditEventModel.find(filter)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(safeLimit)
          .lean(),
        AuditEventModel.countDocuments(filter),
      ]);

      return {
        items,
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

    const total = filtered.length;
    const items = filtered.slice(skip, skip + safeLimit);

    return {
      items,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        total_pages: Math.ceil(total / safeLimit),
      },
    };
  }
}
