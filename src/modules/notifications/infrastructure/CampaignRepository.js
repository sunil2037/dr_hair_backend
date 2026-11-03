import { NotificationCampaignModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class CampaignRepository {
  async create({
    title,
    body,
    audience = 'All app users',
    destination = { type: 'screen', screen: 'home', entityId: null },
    scheduledAt = null,
    createdBy = 'Super Admin',
    targetCount = 0,
    status = null,
  }) {
    const now = new Date();
    const id = `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const parsedScheduled = scheduledAt ? new Date(scheduledAt) : null;
    const initialStatus = status || (parsedScheduled ? 'scheduled' : 'draft');

    const record = {
      id,
      title: title.trim(),
      body: body.trim(),
      audience,
      destination: {
        type: destination?.type || 'screen',
        screen: destination?.screen || 'home',
        entityId: destination?.entityId || null,
      },
      status: initialStatus,
      scheduledAt: parsedScheduled,
      sentAt: null,
      targetCount: Number(targetCount) || 0,
      sentCount: 0,
      failedCount: 0,
      createdBy: String(createdBy || 'Super Admin'),
      errorMessage: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    if (isMongoConnected()) {
      const doc = await NotificationCampaignModel.create({
        ...record,
        created_at: now,
        updated_at: now,
      });
      return doc.toObject();
    }

    store.notificationCampaigns = store.notificationCampaigns || [];
    store.notificationCampaigns.unshift(record);
    return record;
  }

  async findById(id) {
    if (!id) return null;
    if (isMongoConnected()) {
      return NotificationCampaignModel.findOne({ id: String(id) }).lean();
    }
    store.notificationCampaigns = store.notificationCampaigns || [];
    return store.notificationCampaigns.find((c) => c.id === String(id)) || null;
  }

  async update(id, updates = {}) {
    const now = new Date();
    if (isMongoConnected()) {
      return NotificationCampaignModel.findOneAndUpdate(
        { id: String(id) },
        { $set: { ...updates, updated_at: now } },
        { new: true },
      ).lean();
    }
    store.notificationCampaigns = store.notificationCampaigns || [];
    const item = store.notificationCampaigns.find((c) => c.id === String(id));
    if (!item) return null;
    Object.assign(item, updates, { updated_at: now.toISOString() });
    return item;
  }

  async cancel(id, actor = 'Super Admin') {
    const campaign = await this.findById(id);
    if (!campaign) return null;
    if (campaign.status === 'sent' || campaign.status === 'processing') {
      throw new Error(`Cannot cancel a campaign that is already ${campaign.status}.`);
    }
    return this.update(id, {
      status: 'cancelled',
      errorMessage: `Cancelled by ${actor}`,
    });
  }

  async markProcessing(id) {
    const now = new Date();
    if (isMongoConnected()) {
      return NotificationCampaignModel.findOneAndUpdate(
        { id: String(id), status: { $in: ['draft', 'scheduled'] } },
        { $set: { status: 'processing', updated_at: now } },
        { new: true },
      ).lean();
    }
    store.notificationCampaigns = store.notificationCampaigns || [];
    const item = store.notificationCampaigns.find((c) => c.id === String(id));
    if (!item || !['draft', 'scheduled'].includes(item.status)) return null;
    item.status = 'processing';
    item.updated_at = now.toISOString();
    return item;
  }

  async markCompleted(id, { sentCount = 0, failedCount = 0, status = 'sent', errorMessage = null }) {
    const now = new Date();
    return this.update(id, {
      status,
      sentCount: Number(sentCount),
      failedCount: Number(failedCount),
      sentAt: now,
      errorMessage,
    });
  }

  async listDueScheduled(now = new Date()) {
    if (isMongoConnected()) {
      return NotificationCampaignModel.find({
        status: 'scheduled',
        scheduledAt: { $lte: now },
      })
        .sort({ scheduledAt: 1 })
        .lean();
    }
    store.notificationCampaigns = store.notificationCampaigns || [];
    const targetTime = now.getTime();
    return store.notificationCampaigns.filter(
      (c) => c.status === 'scheduled' && c.scheduledAt && new Date(c.scheduledAt).getTime() <= targetTime,
    );
  }

  async list({ page = 1, limit = 50, status, audience } = {}) {
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;

    if (isMongoConnected()) {
      const query = {};
      if (status) query.status = status;
      if (audience) query.audience = audience;

      const [items, total] = await Promise.all([
        NotificationCampaignModel.find(query)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        NotificationCampaignModel.countDocuments(query),
      ]);

      return {
        items: items.map((doc) => ({
          ...doc,
          id: doc.id || doc._id?.toString(),
          created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
          scheduledAt: doc.scheduledAt ? new Date(doc.scheduledAt).toISOString() : null,
          sentAt: doc.sentAt ? new Date(doc.sentAt).toISOString() : null,
        })),
        total,
        page: parsedPage,
        limit: parsedLimit,
        hasMore: skip + items.length < total,
      };
    }

    store.notificationCampaigns = store.notificationCampaigns || [];
    let filtered = [...store.notificationCampaigns];
    if (status) filtered = filtered.filter((c) => c.status === status);
    if (audience) filtered = filtered.filter((c) => c.audience === audience);

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + parsedLimit);

    return {
      items: paginated,
      total,
      page: parsedPage,
      limit: parsedLimit,
      hasMore: skip + paginated.length < total,
    };
  }
}
