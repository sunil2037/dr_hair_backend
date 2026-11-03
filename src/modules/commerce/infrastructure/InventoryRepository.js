import { IInventoryRepository } from '../domain/IInventoryRepository.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { InventoryLedgerModel, ProductModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/index.js';

export class InventoryRepository extends IInventoryRepository {
  async recordMovement({
    productId,
    quantity,
    balanceAfter,
    balance_after,
    referenceType,
    reference_type,
    referenceId = '',
    reference_id = '',
    notes = '',
    createdBy = 'system',
    created_by = 'system',
  }) {
    const cleanProductId = String(productId).trim();
    const type = referenceType || reference_type || 'ADJUSTMENT';
    const refId = referenceId || reference_id || '';
    const creator = createdBy || created_by || 'system';
    const balance = balanceAfter !== undefined ? balanceAfter : (balance_after !== undefined ? balance_after : 0);

    const record = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      product_id: cleanProductId,
      quantity: Number(quantity),
      balance_after: Number(balance),
      reference_type: type,
      reference_id: String(refId),
      notes: String(notes),
      created_by: String(creator),
      created_at: new Date(),
    };

    if (isMongoConnected()) {
      await InventoryLedgerModel.create(record);
      return record;
    }

    if (!Array.isArray(store.inventoryLedgers)) store.inventoryLedgers = [];
    store.inventoryLedgers.push(record);
    return record;
  }

  async reserveStock(items, orderId) {
    if (!Array.isArray(items) || items.length === 0) return true;

    if (isMongoConnected()) {
      const reservedItems = [];
      try {
        for (const item of items) {
          const pId = item.productId || item.product_id;
          const qty = item.quantity || 1;

          const updated = await ProductModel.findOneAndUpdate(
            { id: pId, stock: { $gte: qty } },
            { $inc: { stock: -qty } },
            { new: true },
          );

          if (!updated) {
            throw new ConflictError(`Insufficient stock for product ${pId}`);
          }

          reservedItems.push({ productId: pId, quantity: qty, balanceAfter: updated.stock });
          if (updated.stock <= 0) {
            await ProductModel.updateOne({ id: pId }, { $set: { in_stock: false } });
          }
        }

        // Record ledger movements after all items reserved
        for (const res of reservedItems) {
          await this.recordMovement({
            productId: res.productId,
            quantity: -res.quantity,
            balanceAfter: res.balanceAfter,
            referenceType: 'RESERVATION',
            referenceId: orderId,
            notes: `Stock reserved for order ${orderId}`,
          });
        }

        return true;
      } catch (err) {
        // Roll back previously reserved items
        for (const res of reservedItems) {
          await ProductModel.updateOne(
            { id: res.productId },
            { $inc: { stock: res.quantity }, $set: { in_stock: true } },
          );
        }
        throw err;
      }
    }

    // In-memory store handling
    if (!Array.isArray(store.products)) store.products = [];

    // Step 1: Pre-validation of all items
    for (const item of items) {
      const pId = item.productId || item.product_id;
      const qty = item.quantity || 1;
      const product = store.products.find((p) => p.id === pId);

      if (!product) {
        throw new NotFoundError(`Product not found: ${pId}`);
      }
      const currentStock = product.stock !== undefined ? product.stock : (product.in_stock ? 100 : 0);
      if (currentStock < qty) {
        throw new ConflictError(`Insufficient stock for product ${product.name || pId} (requested ${qty}, available ${currentStock})`);
      }
    }

    // Step 2: Atomic decrement
    for (const item of items) {
      const pId = item.productId || item.product_id;
      const qty = item.quantity || 1;
      const product = store.products.find((p) => p.id === pId);
      product.stock = (product.stock || 100) - qty;
      product.in_stock = product.stock > 0;
      product.inStock = product.stock > 0;

      await this.recordMovement({
        productId: pId,
        quantity: -qty,
        balanceAfter: product.stock,
        referenceType: 'RESERVATION',
        referenceId: orderId,
        notes: `Stock reserved for order ${orderId}`,
      });
    }

    return true;
  }

  async releaseStock(items, orderId) {
    if (!Array.isArray(items) || items.length === 0) return true;

    for (const item of items) {
      const pId = item.productId || item.product_id;
      const qty = item.quantity || 1;

      if (isMongoConnected()) {
        const updated = await ProductModel.findOneAndUpdate(
          { id: pId },
          { $inc: { stock: qty }, $set: { in_stock: true } },
          { new: true },
        );
        const balance = updated ? updated.stock : 0;
        await this.recordMovement({
          productId: pId,
          quantity: qty,
          balanceAfter: balance,
          referenceType: 'RELEASE',
          referenceId: orderId,
          notes: `Stock released from cancelled order ${orderId}`,
        });
      } else {
        if (!Array.isArray(store.products)) store.products = [];
        const product = store.products.find((p) => p.id === pId);
        if (product) {
          product.stock = (product.stock || 0) + qty;
          product.in_stock = true;
          product.inStock = true;
          await this.recordMovement({
            productId: pId,
            quantity: qty,
            balanceAfter: product.stock,
            referenceType: 'RELEASE',
            referenceId: orderId,
            notes: `Stock released from cancelled order ${orderId}`,
          });
        }
      }
    }
    return true;
  }

  async restock(productId, quantity, notes = '', createdBy = 'admin') {
    const cleanProductId = String(productId).trim();
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    if (isMongoConnected()) {
      const updated = await ProductModel.findOneAndUpdate(
        { id: cleanProductId },
        { $inc: { stock: qty }, $set: { in_stock: true } },
        { new: true },
      );
      if (!updated) throw new NotFoundError('Product not found');
      await this.recordMovement({
        productId: cleanProductId,
        quantity: qty,
        balanceAfter: updated.stock,
        referenceType: 'RESTOCK',
        notes,
        createdBy,
      });
      return updated.stock;
    }

    if (!Array.isArray(store.products)) store.products = [];
    const product = store.products.find((p) => p.id === cleanProductId);
    if (!product) throw new NotFoundError('Product not found');
    product.stock = (product.stock || 0) + qty;
    product.in_stock = true;
    product.inStock = true;

    await this.recordMovement({
      productId: cleanProductId,
      quantity: qty,
      balanceAfter: product.stock,
      referenceType: 'RESTOCK',
      notes,
      createdBy,
    });
    return product.stock;
  }

  async getStock(productId) {
    const cleanProductId = String(productId).trim();
    if (isMongoConnected()) {
      const product = await ProductModel.findOne({ id: cleanProductId }).select('stock in_stock').lean();
      if (!product) return 0;
      return product.stock || 0;
    }
    if (!Array.isArray(store.products)) store.products = [];
    const product = store.products.find((p) => p.id === cleanProductId);
    return product ? (product.stock || 0) : 0;
  }

  async listLedger({ productId, page = 1, limit = 50 } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (safePage - 1) * safeLimit;

    if (isMongoConnected()) {
      const query = productId ? { product_id: String(productId).trim() } : {};
      const [items, total] = await Promise.all([
        InventoryLedgerModel.find(query).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
        InventoryLedgerModel.countDocuments(query),
      ]);
      return { items, total, page: safePage, limit: safeLimit };
    }

    if (!Array.isArray(store.inventoryLedgers)) store.inventoryLedgers = [];
    let list = store.inventoryLedgers;
    if (productId) {
      list = list.filter((l) => l.product_id === String(productId).trim());
    }
    list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = list.length;
    const items = list.slice(skip, skip + safeLimit);
    return { items, total, page: safePage, limit: safeLimit };
  }
}
