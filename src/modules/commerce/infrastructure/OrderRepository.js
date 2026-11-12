import { IOrderRepository } from '../domain/IOrderRepository.js';
import { Order } from '../domain/Order.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { OrderModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';
import { NotFoundError } from '../../../shared/errors/index.js';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class OrderRepository extends IOrderRepository {
  async create(order) {
    const data = order instanceof Order ? order.toJSON() : order;

    if (isMongoConnected()) {
      await OrderModel.create(data);
      return new Order(data);
    }

    if (!Array.isArray(store.orders)) store.orders = [];
    store.orders.unshift(data);
    return new Order(data);
  }

  async findById(orderId) {
    const cleanId = String(orderId).trim();

    if (isMongoConnected()) {
      const record = await OrderModel.findOne({
        $or: [{ order_id: cleanId }, { id: cleanId }],
      }).lean();
      if (!record) return null;
      return new Order(record);
    }

    if (!Array.isArray(store.orders)) store.orders = [];
    const found = store.orders.find((o) => o.order_id === cleanId || o.id === cleanId);
    if (!found) return null;
    return new Order(found);
  }

  async claimShiprocketShipment(orderId) {
    const cleanId = String(orderId || '').trim();
    if (!cleanId) return null;

    const canClaim = {
      $and: [
        { $or: [{ order_id: cleanId }, { id: cleanId }] },
        { 'fulfillment.status': 'Preparing' },
        { 'fulfillment.shiprocket_shipment_id': { $in: ['', null] } },
        { 'fulfillment.awb_code': { $in: ['', null] } },
        { 'fulfillment.shiprocket_status': { $nin: ['processing', 'needs_review', 'created'] } },
      ],
    };

    if (isMongoConnected()) {
      const record = await OrderModel.findOneAndUpdate(
        canClaim,
        {
          $set: {
            'fulfillment.shiprocket_status': 'processing',
            updated_at: new Date().toISOString(),
          },
        },
        { new: true },
      ).lean();
      return record ? new Order(record) : null;
    }

    if (!Array.isArray(store.orders)) return null;
    const record = store.orders.find((item) => item.order_id === cleanId || item.id === cleanId);
    if (!record || record.fulfillment?.status !== 'Preparing') return null;
    if (record.fulfillment?.shiprocket_shipment_id || record.fulfillment?.awb_code) return null;
    if (['processing', 'needs_review', 'created'].includes(record.fulfillment?.shiprocket_status)) return null;

    record.fulfillment = { ...record.fulfillment, shiprocket_status: 'processing' };
    record.updated_at = new Date().toISOString();
    return new Order(record);
  }

  async findByIdempotencyKey(key, userId) {
    if (!key) return null;
    const cleanKey = String(key).trim();
    const cleanUserId = String(userId).trim();

    if (isMongoConnected()) {
      const record = await OrderModel.findOne({
        idempotency_key: cleanKey,
        user_id: cleanUserId,
      }).lean();
      if (!record) return null;
      return new Order(record);
    }

    if (!Array.isArray(store.orders)) store.orders = [];
    const found = store.orders.find(
      (o) => o.idempotency_key === cleanKey && String(o.user_id) === cleanUserId,
    );
    if (!found) return null;
    return new Order(found);
  }

  async listByUserId(userId, { page = 1, limit = 20, status } = {}) {
    const cleanUserId = String(userId).trim();
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    if (isMongoConnected()) {
      const query = { user_id: cleanUserId };
      if (status && status !== 'All' && status !== 'all') {
        const lower = status.toLowerCase();
        if (lower === 'pending') {
          query['fulfillment.status'] = { $in: ['New', 'Preparing'] };
        } else if (lower === 'confirmed') {
          query['fulfillment.status'] = { $in: ['Shipped', 'Delivered'] };
        } else if (lower === 'cancelled') {
          query['fulfillment.status'] = { $in: ['Cancelled', 'Refunded', 'Return requested'] };
        } else {
          query['fulfillment.status'] = status;
        }
      }
      const [records, total] = await Promise.all([
        OrderModel.find(query).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
        OrderModel.countDocuments(query),
      ]);
      return {
        items: records.map((r) => new Order(r)),
        total,
        page: safePage,
        limit: safeLimit,
        has_more: skip + records.length < total,
      };
    }

    if (!Array.isArray(store.orders)) store.orders = [];
    let filtered = store.orders.filter((o) => String(o.user_id) === cleanUserId);
    if (status && status !== 'All' && status !== 'all') {
      const lower = status.toLowerCase();
      filtered = filtered.filter((o) => {
        const st = (o.fulfillment?.status || o.status || 'New').toString().toLowerCase();
        if (lower === 'pending') return st === 'new' || st === 'preparing';
        if (lower === 'confirmed') return st === 'shipped' || st === 'delivered';
        if (lower === 'cancelled') return st === 'cancelled' || st === 'refunded' || st.includes('return');
        return st === lower;
      });
    }
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = filtered.length;
    const items = filtered.slice(skip, skip + safeLimit).map((o) => new Order(o));
    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      has_more: skip + items.length < total,
    };
  }

  async listAdmin({
    status,
    paymentStatus,
    search,
    fromDate,
    toDate,
    page = 1,
    limit = 50,
  } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (safePage - 1) * safeLimit;

    if (isMongoConnected()) {
      const andClauses = [];
      if (status && status !== 'All' && status !== 'all') {
        andClauses.push({ 'fulfillment.status': status });
      }
      if (paymentStatus && paymentStatus !== 'All' && paymentStatus !== 'all') {
        andClauses.push({ 'payment.payment_status': paymentStatus });
      }
      if (fromDate) {
        andClauses.push({ created_at: { $gte: new Date(fromDate) } });
      }
      if (toDate) {
        andClauses.push({ created_at: { $lte: new Date(toDate) } });
      }
      if (search && search.trim()) {
        const regex = new RegExp(escapeRegex(search.trim()), 'i');
        andClauses.push({
          $or: [
            { order_id: regex },
            { 'customer.name': regex },
            { 'customer.email': regex },
            { 'customer.phone': regex },
            { 'fulfillment.tracking_number': regex },
            { 'items.title': regex },
          ],
        });
      }

      const query = andClauses.length > 0 ? (andClauses.length === 1 ? andClauses[0] : { $and: andClauses }) : {};
      const [records, total] = await Promise.all([
        OrderModel.find(query).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
        OrderModel.countDocuments(query),
      ]);

      return {
        items: records.map((r) => new Order(r)),
        total,
        page: safePage,
        limit: safeLimit,
        has_more: skip + records.length < total,
      };
    }

    if (!Array.isArray(store.orders)) store.orders = [];
    let list = [...store.orders];

    if (status && status !== 'All' && status !== 'all') {
      list = list.filter((o) => (o.fulfillment?.status || o.status) === status);
    }
    if (paymentStatus && paymentStatus !== 'All' && paymentStatus !== 'all') {
      list = list.filter((o) => (o.payment?.payment_status || o.payment_status) === paymentStatus);
    }
    if (fromDate) {
      const from = new Date(fromDate).getTime();
      list = list.filter((o) => new Date(o.created_at).getTime() >= from);
    }
    if (toDate) {
      const to = new Date(toDate).getTime();
      list = list.filter((o) => new Date(o.created_at).getTime() <= to);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) => {
        const id = (o.order_id || o.id || '').toLowerCase();
        const name = (o.customer?.name || '').toLowerCase();
        const email = (o.customer?.email || '').toLowerCase();
        const phone = (o.customer?.phone || '').toLowerCase();
        const tracking = (o.fulfillment?.tracking_number || o.trackingNumber || '').toLowerCase();
        const items = Array.isArray(o.items) ? o.items.map((i) => (i.title || i.name || '').toLowerCase()).join(' ') : '';
        return id.includes(q) || name.includes(q) || email.includes(q) || phone.includes(q) || tracking.includes(q) || items.includes(q);
      });
    }

    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = list.length;
    const items = list.slice(skip, skip + safeLimit).map((o) => new Order(o));
    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      has_more: skip + items.length < total,
    };
  }

  async update(orderId, patch) {
    const existing = await this.findById(orderId);
    if (!existing) {
      throw new NotFoundError('Order not found');
    }

    const updatedData = {
      ...existing.toJSON(),
      ...patch,
      updated_at: new Date().toISOString(),
    };
    if (patch.payment) {
      updatedData.payment = { ...existing.payment, ...patch.payment };
      updatedData.payment_status = updatedData.payment.payment_status;
      updatedData.paymentStatus = updatedData.payment.payment_status;
    }
    if (patch.fulfillment) {
      updatedData.fulfillment = { ...existing.fulfillment, ...patch.fulfillment };
      updatedData.fulfillment_status = updatedData.fulfillment.status;
      updatedData.status = updatedData.fulfillment.status;
    }

    const updated = new Order(updatedData);

    if (isMongoConnected()) {
      await OrderModel.findOneAndUpdate(
        { $or: [{ order_id: existing.order_id }, { id: existing.order_id }] },
        { $set: updated.toJSON() },
        { new: true },
      );
      return updated;
    }

    if (!Array.isArray(store.orders)) store.orders = [];
    const idx = store.orders.findIndex((o) => o.order_id === existing.order_id || o.id === existing.order_id);
    if (idx >= 0) {
      store.orders[idx] = updated.toJSON();
    }
    return updated;
  }
}
