import { NotificationModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class NotificationRepository {
  async create({
    userId = null,
    title,
    body,
    type = 'general',
    destination = { type: 'screen', screen: 'home' },
    data = {},
  }) {
    const now = new Date();
    const id = `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id,
      userId: userId !== null && userId !== undefined ? Number(userId) : null,
      title: title.trim(),
      body: body.trim(),
      type,
      destination: {
        type: destination?.type || 'screen',
        screen: destination?.screen || null,
        entityId: destination?.entityId || null,
      },
      data: data || {},
      isRead: false,
      readAt: null,
      created_at: now.toISOString(),
    };

    if (isMongoConnected()) {
      const doc = await NotificationModel.create({
        ...record,
        created_at: now,
      });
      return doc.toObject();
    }

    store.notifications = store.notifications || [];
    store.notifications.unshift(record);
    return record;
  }

  async listByUserId(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const numericId = Number(userId);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    if (isMongoConnected()) {
      const query = {
        $or: [{ userId: numericId }, { userId: null }],
      };
      if (unreadOnly) {
        query.isRead = false;
      }

      const [items, total, unreadCount] = await Promise.all([
        NotificationModel.find(query)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        NotificationModel.countDocuments(query),
        NotificationModel.countDocuments({
          $or: [{ userId: numericId }, { userId: null }],
          isRead: false,
        }),
      ]);

      return {
        items: items.map((doc) => ({
          ...doc,
          id: doc.id || doc._id?.toString(),
          created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
          readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
        })),
        total,
        unreadCount,
        page: parsedPage,
        limit: parsedLimit,
        hasMore: skip + items.length < total,
      };
    }

    store.notifications = store.notifications || [];
    let filtered = store.notifications.filter(
      (n) => n.userId === numericId || n.userId === null,
    );

    const unreadCount = filtered.filter((n) => !n.isRead).length;

    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.isRead);
    }

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + parsedLimit);

    return {
      items: paginated,
      total,
      unreadCount,
      page: parsedPage,
      limit: parsedLimit,
      hasMore: skip + paginated.length < total,
    };
  }

  async markAsRead(id, userId) {
    const numericUserId = Number(userId);
    const now = new Date();

    if (isMongoConnected()) {
      const updated = await NotificationModel.findOneAndUpdate(
        {
          id,
          $or: [{ userId: numericUserId }, { userId: null }],
        },
        {
          $set: {
            isRead: true,
            readAt: now,
          },
        },
        { new: true },
      ).lean();

      return updated ? { ...updated, id: updated.id } : null;
    }

    store.notifications = store.notifications || [];
    const item = store.notifications.find(
      (n) => n.id === id && (n.userId === numericUserId || n.userId === null),
    );
    if (!item) return null;

    item.isRead = true;
    item.readAt = now.toISOString();
    return item;
  }

  async markAllAsRead(userId) {
    const numericUserId = Number(userId);
    const now = new Date();

    if (isMongoConnected()) {
      await NotificationModel.updateMany(
        {
          $or: [{ userId: numericUserId }, { userId: null }],
          isRead: false,
        },
        {
          $set: {
            isRead: true,
            readAt: now,
          },
        },
      );
      return true;
    }

    store.notifications = store.notifications || [];
    store.notifications.forEach((n) => {
      if ((n.userId === numericUserId || n.userId === null) && !n.isRead) {
        n.isRead = true;
        n.readAt = now.toISOString();
      }
    });
    return true;
  }

  async listCampaigns({ page = 1, limit = 50 } = {}) {
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;

    if (isMongoConnected()) {
      const [items, total] = await Promise.all([
        NotificationModel.find()
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        NotificationModel.countDocuments(),
      ]);

      return {
        items: items.map((doc) => ({
          ...doc,
          id: doc.id || doc._id?.toString(),
          created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
        })),
        total,
        page: parsedPage,
        limit: parsedLimit,
        hasMore: skip + items.length < total,
      };
    }

    store.notifications = store.notifications || [];
    const sorted = [...store.notifications].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const total = sorted.length;
    const paginated = sorted.slice(skip, skip + parsedLimit);

    return {
      items: paginated,
      total,
      page: parsedPage,
      limit: parsedLimit,
      hasMore: skip + paginated.length < total,
    };
  }
}
