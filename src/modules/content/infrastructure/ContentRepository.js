import { ContentItemModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export const VALID_CONTENT_STATUSES = ['draft', 'review', 'published', 'hidden', 'archived'];
export const VALID_CONTENT_TYPES = ['banner', 'faq', 'tip', 'story', 'home_placement'];
export const VALID_CONTENT_PLACEMENTS = ['home', 'reels', 'care', 'explore', 'all'];

export class ContentRepository {
  async create({
    type,
    title,
    subtitle = '',
    content = '',
    imageUrl = '',
    actionUrl = '',
    placement = 'home',
    status = 'draft',
    provenance = {},
    sortOrder = 0,
    metadata = {},
  }) {
    if (!VALID_CONTENT_TYPES.includes(type)) {
      throw new Error(`Invalid content type: ${type}. Must be one of ${VALID_CONTENT_TYPES.join(', ')}.`);
    }
    if (!VALID_CONTENT_STATUSES.includes(status)) {
      throw new Error(`Invalid content status: ${status}. Must be one of ${VALID_CONTENT_STATUSES.join(', ')}.`);
    }

    const now = new Date();
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record = {
      id,
      type,
      title: title.trim(),
      subtitle: (subtitle || '').trim(),
      content: (content || '').trim(),
      imageUrl: (imageUrl || '').trim(),
      actionUrl: (actionUrl || '').trim(),
      placement: VALID_CONTENT_PLACEMENTS.includes(placement) ? placement : 'home',
      status,
      provenance: {
        consent_verified: Boolean(provenance?.consent_verified),
        consent_reference: String(provenance?.consent_reference || ''),
        source: String(provenance?.source || 'Dr. Hair Clinical Protocol'),
        approved_by: String(provenance?.approved_by || ''),
        evidence_note: String(provenance?.evidence_note || ''),
        approved_at: provenance?.approved_at ? new Date(provenance.approved_at) : null,
      },
      sortOrder: Number(sortOrder) || 0,
      metadata: metadata || {},
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    if (isMongoConnected()) {
      const doc = await ContentItemModel.create({
        ...record,
        created_at: now,
        updated_at: now,
      });
      return doc.toObject();
    }

    store.contentItems = store.contentItems || [];
    store.contentItems.push(record);
    return record;
  }

  async findById(id) {
    if (!id) return null;
    if (isMongoConnected()) {
      return ContentItemModel.findOne({ id: String(id) }).lean();
    }
    store.contentItems = store.contentItems || [];
    return store.contentItems.find((item) => item.id === String(id)) || null;
  }

  async update(id, updates = {}) {
    const now = new Date();
    if (isMongoConnected()) {
      return ContentItemModel.findOneAndUpdate(
        { id: String(id) },
        { $set: { ...updates, updated_at: now } },
        { new: true },
      ).lean();
    }
    store.contentItems = store.contentItems || [];
    const item = store.contentItems.find((c) => c.id === String(id));
    if (!item) return null;

    for (const [key, value] of Object.entries(updates)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let curr = item;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!curr[parts[i]]) curr[parts[i]] = {};
          curr = curr[parts[i]];
        }
        curr[parts[parts.length - 1]] = value;
      } else {
        item[key] = value;
      }
    }
    item.updated_at = now.toISOString();
    return item;
  }

  async updateStatus(id, newStatus, { approved_by = 'Super Admin', note = '' } = {}) {
    if (!VALID_CONTENT_STATUSES.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be one of ${VALID_CONTENT_STATUSES.join(', ')}.`);
    }

    const current = await this.findById(id);
    if (!current) return null;

    const updates = { status: newStatus };
    if (newStatus === 'published') {
      updates['provenance.approved_by'] = approved_by;
      updates['provenance.approved_at'] = new Date();
      if (note) updates['provenance.evidence_note'] = note;
    }

    return this.update(id, updates);
  }

  async listPublished({ type, placement, limit = 50 } = {}) {
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));

    if (isMongoConnected()) {
      const query = { status: 'published' };
      if (type) query.type = type;
      if (placement && placement !== 'all') {
        query.$or = [{ placement }, { placement: 'all' }];
      }
      if (type === 'story') {
        query['provenance.consent_verified'] = true;
      }

      return ContentItemModel.find(query)
        .sort({ sortOrder: 1, created_at: -1 })
        .limit(parsedLimit)
        .lean();
    }

    store.contentItems = store.contentItems || [];
    let items = store.contentItems.filter((item) => item.status === 'published');
    if (type) items = items.filter((item) => item.type === type);
    if (placement && placement !== 'all') {
      items = items.filter((item) => item.placement === placement || item.placement === 'all');
    }
    if (type === 'story') {
      items = items.filter((item) => item.provenance?.consent_verified === true);
    }

    items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || new Date(b.created_at) - new Date(a.created_at));
    return items.slice(0, parsedLimit);
  }

  async listAdmin({ type, status, placement, page = 1, limit = 50 } = {}) {
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;

    if (isMongoConnected()) {
      const query = {};
      if (type) query.type = type;
      if (status) query.status = status;
      if (placement) query.placement = placement;

      const [items, total] = await Promise.all([
        ContentItemModel.find(query)
          .sort({ sortOrder: 1, created_at: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        ContentItemModel.countDocuments(query),
      ]);

      return {
        items,
        total,
        page: parsedPage,
        limit: parsedLimit,
        hasMore: skip + items.length < total,
      };
    }

    store.contentItems = store.contentItems || [];
    let items = [...store.contentItems];
    if (type) items = items.filter((item) => item.type === type);
    if (status) items = items.filter((item) => item.status === status);
    if (placement) items = items.filter((item) => item.placement === placement);

    items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || new Date(b.created_at) - new Date(a.created_at));
    const total = items.length;
    const paginated = items.slice(skip, skip + parsedLimit);

    return {
      items: paginated,
      total,
      page: parsedPage,
      limit: parsedLimit,
      hasMore: skip + paginated.length < total,
    };
  }

  async delete(id) {
    if (isMongoConnected()) {
      const result = await ContentItemModel.deleteOne({ id: String(id) });
      return result.deletedCount > 0;
    }
    store.contentItems = store.contentItems || [];
    const index = store.contentItems.findIndex((c) => c.id === String(id));
    if (index === -1) return false;
    store.contentItems.splice(index, 1);
    return true;
  }
}
