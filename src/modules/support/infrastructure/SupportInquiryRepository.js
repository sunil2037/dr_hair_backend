import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { SupportInquiryModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';
import { randomUUID } from 'node:crypto';

export class SupportInquiryRepository {
  async create({ name, email, phone, message, userId = null }) {
    const id = `inq_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const record = {
      id,
      name: String(name).trim(),
      email: email ? String(email).trim().toLowerCase() : null,
      phone: String(phone).trim(),
      message: String(message).trim(),
      user_id: userId,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (isMongoConnected()) {
      await SupportInquiryModel.create(record);
      return record;
    }

    store.supportInquiries ||= [];
    store.supportInquiries.unshift(record);
    return record;
  }

  async list({ status, page = 1, limit = 20 } = {}) {
    const numericPage = Math.max(1, parseInt(page, 10) || 1);
    const numericLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (numericPage - 1) * numericLimit;

    if (isMongoConnected()) {
      const filter = {};
      if (status && status !== 'all') filter.status = status;

      const [items, total] = await Promise.all([
        SupportInquiryModel.find(filter)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(numericLimit)
          .lean(),
        SupportInquiryModel.countDocuments(filter),
      ]);

      return {
        items,
        total,
        page: numericPage,
        limit: numericLimit,
        has_more: skip + items.length < total,
      };
    }

    store.supportInquiries ||= [];
    let filtered = [...store.supportInquiries];
    if (status && status !== 'all') {
      filtered = filtered.filter((i) => i.status === status);
    }
    const total = filtered.length;
    const items = filtered.slice(skip, skip + numericLimit);

    return {
      items,
      total,
      page: numericPage,
      limit: numericLimit,
      has_more: skip + items.length < total,
    };
  }

  async updateStatus(id, status, adminNotes = null) {
    const cleanId = String(id).trim();
    const update = {
      status,
      updated_at: new Date(),
    };
    if (adminNotes !== null) update.admin_notes = adminNotes;

    if (isMongoConnected()) {
      return SupportInquiryModel.findOneAndUpdate(
        { id: cleanId },
        { $set: update },
        { new: true },
      ).lean();
    }

    store.supportInquiries ||= [];
    const index = store.supportInquiries.findIndex((i) => i.id === cleanId);
    if (index === -1) return null;
    store.supportInquiries[index] = {
      ...store.supportInquiries[index],
      ...update,
    };
    return store.supportInquiries[index];
  }
}
