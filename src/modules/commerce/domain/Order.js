import { BadRequestError } from '../../../shared/errors/index.js';

export const ORDER_FULFILLMENT_STATUSES = [
  'New',
  'Preparing',
  'Shipped',
  'Delivered',
  'Cancelled',
  'Return requested',
  'Refunded',
];

export const ORDER_PAYMENT_STATUSES = [
  'Pending',
  'Paid',
  'Failed',
  'Refunded',
  'Partially refunded',
];

export class OrderItem {
  constructor({
    product_id,
    productId,
    title,
    name,
    subtitle = '',
    desc = '',
    price,
    mrp,
    quantity = 1,
    plan = 'Standard',
    image_url = '',
    image = '',
    subtotal,
  }) {
    this.product_id = String(product_id || productId || '').trim();
    this.title = String(title || name || '').trim();
    this.subtitle = String(subtitle || desc || '').trim();
    this.price = Number(price) || 0;
    this.mrp = Number(mrp) || this.price;
    this.quantity = Math.max(1, parseInt(quantity, 10) || 1);
    this.plan = String(plan || 'Standard');
    this.image_url = String(image_url || image || '');
    this.subtotal = Number(subtotal) || (this.price * this.quantity);

    if (!this.product_id) throw new BadRequestError('Product ID is required for each order item');
    if (this.price <= 0) throw new BadRequestError(`Invalid price for product ${this.product_id}`);
  }

  toJSON() {
    return {
      product_id: this.product_id,
      productId: this.product_id,
      title: this.title,
      name: this.title,
      subtitle: this.subtitle,
      price: this.price,
      mrp: this.mrp,
      quantity: this.quantity,
      plan: this.plan,
      image_url: this.image_url,
      image: this.image_url,
      subtotal: this.subtotal,
    };
  }
}

export class Order {
  constructor({
    order_id,
    id,
    idempotency_key = null,
    user_id,
    userId,
    customer = {},
    items = [],
    shipping_address = {},
    shippingAddress,
    pricing = {},
    payment = {},
    fulfillment = {},
    timeline = [],
    created_at,
    updated_at,
  }) {
    this.order_id = String(order_id || id || `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`);
    this.id = this.order_id;
    this.idempotency_key = idempotency_key ? String(idempotency_key).trim() : null;
    this.user_id = String(user_id || userId || '').trim();
    this.customer = {
      name: String(customer.name || '').trim(),
      email: String(customer.email || '').trim(),
      phone: String(customer.phone || '').trim(),
    };
    this.items = Array.isArray(items)
      ? items.map((item) => (item instanceof OrderItem ? item : new OrderItem(item)))
      : [];
    if (this.items.length === 0) {
      throw new BadRequestError('Order must contain at least one item');
    }

    const addr = shipping_address || shippingAddress || {};
    this.shipping_address = {
      id: addr.id || '',
      name: String(addr.name || this.customer.name || '').trim(),
      phone: String(addr.phone || this.customer.phone || '').trim(),
      house_number: String(addr.house_number || addr.houseNumber || '').trim(),
      street: String(addr.street || '').trim(),
      city: String(addr.city || '').trim(),
      state: String(addr.state || '').trim(),
      pincode: String(addr.pincode || addr.pinCode || '').trim(),
      tag: String(addr.tag || 'Home'),
      formattedAddress: addr.formattedAddress || `${addr.house_number || addr.houseNumber || ''}, ${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || addr.pinCode || ''}`,
    };

    const calculatedSubtotal = this.items.reduce((acc, it) => acc + it.subtotal, 0);
    const subtotal = Number(pricing.subtotal) || calculatedSubtotal;
    const discount = Math.max(0, Number(pricing.discount) || 0);
    const coupon_code = pricing.coupon_code || pricing.couponCode || null;
    const delivery_fee = Number(pricing.delivery_fee ?? pricing.deliveryFee ?? (subtotal >= 499 ? 0 : 50));
    const tax = Number(pricing.tax) || 0;
    const total = Math.max(0, subtotal - discount + delivery_fee + tax);

    this.pricing = {
      subtotal,
      discount,
      coupon_code,
      delivery_fee,
      tax,
      total,
    };

    const paymentStatus = payment.payment_status || payment.status || 'Pending';
    this.payment = {
      gateway: payment.gateway || 'razorpay',
      payment_status: ORDER_PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : 'Pending',
      payment_intent_id: payment.payment_intent_id || payment.paymentIntentId || null,
      transaction_id: payment.transaction_id || payment.transactionId || null,
      payment_signature: payment.payment_signature || null,
      paid_at: payment.paid_at || null,
      refund_id: payment.refund_id || null,
      refund_amount: Number(payment.refund_amount) || 0,
      refunded_at: payment.refunded_at || null,
    };

    const fulfillmentStatus = fulfillment.status || 'New';
    this.fulfillment = {
      status: ORDER_FULFILLMENT_STATUSES.includes(fulfillmentStatus) ? fulfillmentStatus : 'New',
      courier: fulfillment.courier || '',
      tracking_number: fulfillment.tracking_number || fulfillment.trackingNumber || '',
      shipped_at: fulfillment.shipped_at || null,
      delivered_at: fulfillment.delivered_at || null,
      cancellation_reason: fulfillment.cancellation_reason || null,
      cancelled_at: fulfillment.cancelled_at || null,
      return_reason: fulfillment.return_reason || null,
      returned_at: fulfillment.returned_at || null,
    };

    this.timeline = Array.isArray(timeline) && timeline.length > 0
      ? timeline
      : [
          {
            label: 'Order placed',
            timestamp: created_at || new Date().toISOString(),
            done: true,
          },
        ];

    this.created_at = created_at || new Date().toISOString();
    this.updated_at = updated_at || new Date().toISOString();
  }

  addTimelineEvent(label) {
    this.timeline.push({
      label,
      timestamp: new Date().toISOString(),
      done: true,
    });
    this.updated_at = new Date().toISOString();
  }

  toJSON() {
    return {
      order_id: this.order_id,
      id: this.order_id,
      idempotency_key: this.idempotency_key,
      user_id: this.user_id,
      userId: this.user_id,
      customer: this.customer,
      items: this.items.map((i) => i.toJSON()),
      shipping_address: this.shipping_address,
      shippingAddress: this.shipping_address,
      pricing: this.pricing,
      payment: this.payment,
      payment_status: this.payment.payment_status,
      paymentStatus: this.payment.payment_status,
      fulfillment: this.fulfillment,
      fulfillment_status: this.fulfillment.status,
      status: this.fulfillment.status,
      timeline: this.timeline,
      created_at: this.created_at,
      date: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
