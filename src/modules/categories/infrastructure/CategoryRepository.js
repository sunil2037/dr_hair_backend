import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { CategoryModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';

export class CategoryRepository {
  async list({ type, status = 'active' } = {}) {
    if (isMongoConnected()) {
      const filter = {};
      if (type && type !== 'all') {
        filter.type = type;
      }
      if (status && status !== 'all') {
        filter.status = status;
      }
      const items = await CategoryModel.find(filter).sort({ display_order: 1, created_at: 1 }).lean();
      return items.map((doc) => ({
        id: doc._id?.toString() || doc.id || doc.slug,
        _id: doc._id?.toString(),
        name: doc.name,
        slug: doc.slug,
        type: doc.type,
        icon: doc.icon || 'film',
        badge: doc.badge || null,
        description: doc.description || '',
        status: doc.status || 'active',
        display_order: doc.display_order ?? 0,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      }));
    }

    if (!Array.isArray(store.categories)) {
      store.categories = [];
    }
    return store.categories
      .filter((c) => {
        if (type && type !== 'all' && c.type !== type) return false;
        if (status && status !== 'all' && c.status !== status) return false;
        return true;
      })
      .map((c) => ({ ...c, id: c.id || c.slug }));
  }

  async findById(id) {
    if (!id) return null;
    if (isMongoConnected()) {
      let doc = null;
      try {
        doc = await CategoryModel.findById(id).lean();
      } catch (_) {}
      if (!doc) {
        doc = await CategoryModel.findOne({
          $or: [{ slug: String(id).toLowerCase() }, { name: new RegExp(`^${id}$`, 'i') }],
        }).lean();
      }
      if (doc) {
        return {
          id: doc._id?.toString() || doc.id || doc.slug,
          _id: doc._id?.toString(),
          name: doc.name,
          slug: doc.slug,
          type: doc.type,
          icon: doc.icon,
          badge: doc.badge,
          description: doc.description,
          status: doc.status,
          display_order: doc.display_order,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
        };
      }
      return null;
    }

    if (!Array.isArray(store.categories)) return null;
    return (
      store.categories.find(
        (c) =>
          c.id === id ||
          c.slug === String(id).toLowerCase() ||
          c.name?.toLowerCase() === String(id).toLowerCase(),
      ) || null
    );
  }

  async create({
    name,
    slug,
    type = 'video',
    icon = 'film',
    badge = null,
    description = '',
    status = 'active',
    display_order = 0,
  } = {}) {
    const trimmedName = String(name || '').trim();
    const computedSlug = (slug || trimmedName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const record = {
      name: trimmedName,
      slug: computedSlug || `cat-${Date.now()}`,
      type,
      icon: icon || (type === 'video' ? 'film' : 'sparkles'),
      badge,
      description,
      status: status || 'active',
      display_order: Number.isFinite(Number(display_order)) ? Number(display_order) : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isMongoConnected()) {
      // Upsert by slug and type to avoid duplicate index crashes
      const created = await CategoryModel.findOneAndUpdate(
        { slug: record.slug, type: record.type },
        { $set: record },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      return {
        id: created._id?.toString() || created.id || created.slug,
        _id: created._id?.toString(),
        ...created,
      };
    }

    if (!Array.isArray(store.categories)) {
      store.categories = [];
    }
    const existingIndex = store.categories.findIndex(
      (c) => c.slug === record.slug && c.type === record.type,
    );
    const itemWithId = {
      id: `cat_${record.type}_${record.slug.replace(/-/g, '_')}`,
      ...record,
    };
    if (existingIndex >= 0) {
      store.categories[existingIndex] = { ...store.categories[existingIndex], ...itemWithId };
      return store.categories[existingIndex];
    }
    store.categories.push(itemWithId);
    return itemWithId;
  }

  async update(id, updates = {}) {
    if (!id) return null;
    const allowed = {};
    if (updates.name && typeof updates.name === 'string') {
      allowed.name = updates.name.trim();
      if (!updates.slug) {
        allowed.slug = allowed.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      }
    }
    if (updates.slug && typeof updates.slug === 'string') {
      allowed.slug = updates.slug.trim().toLowerCase();
    }
    if (updates.icon && typeof updates.icon === 'string') allowed.icon = updates.icon.trim();
    if (updates.badge !== undefined) allowed.badge = updates.badge;
    if (updates.description !== undefined) allowed.description = String(updates.description).trim();
    if (updates.status && (updates.status === 'active' || updates.status === 'inactive')) {
      allowed.status = updates.status;
    }
    if (updates.display_order !== undefined) {
      allowed.display_order = Number(updates.display_order) || 0;
    }
    allowed.updated_at = new Date().toISOString();

    if (isMongoConnected()) {
      let updated = null;
      try {
        updated = await CategoryModel.findByIdAndUpdate(id, { $set: allowed }, { new: true }).lean();
      } catch (_) {}
      if (!updated) {
        updated = await CategoryModel.findOneAndUpdate(
          { $or: [{ slug: String(id).toLowerCase() }, { name: new RegExp(`^${id}$`, 'i') }] },
          { $set: allowed },
          { new: true },
        ).lean();
      }
      return updated
        ? {
            id: updated._id?.toString() || updated.id || updated.slug,
            _id: updated._id?.toString(),
            ...updated,
          }
        : null;
    }

    if (!Array.isArray(store.categories)) return null;
    const index = store.categories.findIndex(
      (c) =>
        c.id === id ||
        c.slug === String(id).toLowerCase() ||
        c.name?.toLowerCase() === String(id).toLowerCase(),
    );
    if (index >= 0) {
      store.categories[index] = { ...store.categories[index], ...allowed };
      return store.categories[index];
    }
    return null;
  }

  async delete(id) {
    if (!id) return false;
    if (isMongoConnected()) {
      let res = null;
      try {
        res = await CategoryModel.findByIdAndDelete(id);
      } catch (_) {}
      if (!res) {
        res = await CategoryModel.findOneAndDelete({
          $or: [{ slug: String(id).toLowerCase() }, { name: new RegExp(`^${id}$`, 'i') }],
        });
      }
      return Boolean(res);
    }

    if (!Array.isArray(store.categories)) return false;
    const initialLen = store.categories.length;
    store.categories = store.categories.filter(
      (c) =>
        c.id !== id &&
        c.slug !== String(id).toLowerCase() &&
        c.name?.toLowerCase() !== String(id).toLowerCase(),
    );
    return store.categories.length < initialLen;
  }
}
