import { IProductRepository } from '../domain/IProductRepository.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { ProductModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ProductRepository extends IProductRepository {
  async list({
    category,
    rootCause,
    search,
    inStock,
    status = 'active',
    page = 1,
    limit = 20,
  } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    if (isMongoConnected()) {
      const andClauses = [];
      if (status && status !== 'all') {
        andClauses.push({ status: new RegExp(`^${escapeRegex(status)}$`, 'i') });
      }
      if (category && category !== 'All' && category !== 'all') {
        andClauses.push({ category: new RegExp(escapeRegex(category), 'i') });
      }
      if (rootCause && rootCause !== 'All' && rootCause !== 'all') {
        const safeRootCause = escapeRegex(rootCause);
        andClauses.push({
          $or: [
            { root_cause: new RegExp(`^${safeRootCause}$`, 'i') },
            { root_causes: new RegExp(`^${safeRootCause}$`, 'i') },
          ],
        });
      }
      if (inStock !== undefined) {
        andClauses.push({ in_stock: Boolean(inStock) });
        if (inStock === true) andClauses.push({ stock: { $gt: 0 } });
      }
      if (search && search.trim()) {
        const regex = new RegExp(escapeRegex(search.trim()), 'i');
        andClauses.push({
          $or: [
            { name: regex },
            { subtitle: regex },
            { category: regex },
            { sku: regex },
            { 'ingredients.name': regex },
          ],
        });
      }

      const query = andClauses.length > 0 ? (andClauses.length === 1 ? andClauses[0] : { $and: andClauses }) : {};

      const [items, total] = await Promise.all([
        ProductModel.find(query).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
        ProductModel.countDocuments(query),
      ]);
      const has_more = skip + items.length < total;

      return { items, total, page: safePage, limit: safeLimit, has_more };
    }

    if (!Array.isArray(store.products)) {
      store.products = [];
    }

    const filtered = store.products.filter((product) => {
      if (status && status !== 'all' && product.status?.toLowerCase() !== status.toLowerCase()) {
        return false;
      }
      if (category && category !== 'All' && category !== 'all') {
        const cat = (product.category || '').toLowerCase();
        if (!cat.includes(category.toLowerCase())) return false;
      }
      if (rootCause && rootCause !== 'All' && rootCause !== 'all') {
        const target = rootCause.toLowerCase();
        const primary = (product.root_cause || product.rootCause || '').toLowerCase();
        const list = (product.root_causes || product.rootCauses || []).map((c) => String(c).toLowerCase());
        if (primary !== target && !list.includes(target)) {
          return false;
        }
      }
      if (inStock !== undefined) {
        const stockStatus = product.in_stock ?? product.inStock ?? true;
        if (Boolean(stockStatus) !== Boolean(inStock)) return false;
        if (inStock === true && !(Number(product.stock) > 0)) return false;
      }
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const name = (product.name || '').toLowerCase();
        const subtitle = (product.subtitle || product.description || '').toLowerCase();
        const sku = (product.sku || '').toLowerCase();
        const categoryMatch = (product.category || '').toLowerCase().includes(q);
        const ingredientMatch = Array.isArray(product.ingredients) &&
          product.ingredients.some((ing) => (ing.name || '').toLowerCase().includes(q));

        if (!name.includes(q) && !subtitle.includes(q) && !sku.includes(q) && !categoryMatch && !ingredientMatch) {
          return false;
        }
      }
      return true;
    });

    const total = filtered.length;
    const items = filtered.slice(skip, skip + safeLimit);
    const has_more = skip + items.length < total;

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      has_more,
    };
  }

  async findById(id) {
    if (!id) return null;
    const cleanId = String(id).trim();

    if (isMongoConnected()) {
      return ProductModel.findOne({
        $or: [{ id: cleanId }, { sku: cleanId }, { _id: cleanId.match(/^[0-9a-fA-F]{24}$/) ? cleanId : null }],
      }).lean();
    }

    if (!Array.isArray(store.products)) store.products = [];
    return store.products.find((p) => String(p.id) === cleanId || String(p.sku) === cleanId) || null;
  }

  async getById(id) {
    return this.findById(id);
  }

  async create(productData) {
    if (isMongoConnected()) {
      try {
        return await ProductModel.create(productData);
      } catch (err) {
        if (err?.code === 11000) {
          const uniqueSuffix = '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
          const uniqueData = {
            ...productData,
            id: (productData.id || `prd-${Date.now()}`) + uniqueSuffix.toLowerCase(),
            sku: (productData.sku && productData.sku !== 'DRH-NEW' ? productData.sku : 'DRH') + uniqueSuffix,
          };
          return await ProductModel.create(uniqueData);
        }
        throw err;
      }
    }

    if (!Array.isArray(store.products)) store.products = [];
    const record = {
      ...productData,
      created_at: productData.created_at || new Date().toISOString(),
      updated_at: productData.updated_at || new Date().toISOString(),
    };
    store.products.unshift(record);
    return record;
  }

  async update(id, productData) {
    const cleanId = String(id).trim();
    if (isMongoConnected()) {
      return ProductModel.findOneAndUpdate(
        { id: cleanId },
        { ...productData, updated_at: new Date() },
        { new: true, runValidators: true },
      ).lean();
    }

    if (!Array.isArray(store.products)) store.products = [];
    const index = store.products.findIndex((p) => String(p.id) === cleanId);
    if (index === -1) return null;

    const updated = {
      ...store.products[index],
      ...productData,
      updated_at: new Date().toISOString(),
    };
    store.products[index] = updated;
    return updated;
  }

  async delete(id) {
    const cleanId = String(id).trim();
    if (isMongoConnected()) {
      const result = await ProductModel.deleteOne({ id: cleanId });
      return result.deletedCount > 0;
    }

    if (!Array.isArray(store.products)) store.products = [];
    const index = store.products.findIndex((p) => String(p.id) === cleanId);
    if (index === -1) return false;

    store.products.splice(index, 1);
    return true;
  }
}
