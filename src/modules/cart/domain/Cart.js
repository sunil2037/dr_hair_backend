import { BadRequestError } from '../../../shared/errors/index.js';

export class CartItem {
  constructor({
    id,
    productId,
    product_id,
    title,
    name,
    desc = '',
    subtitle = '',
    plan = 'Standard',
    plan_id,
    price = 0,
    mrp,
    quantity = 1,
    image = '',
  }) {
    this.productId = productId || product_id || '';
    this.product_id = this.productId;
    this.plan = plan || 'Standard';
    this.plan_id = plan_id || this.plan;
    this.id = id || `${this.productId}::${this.plan}`;
    this.title = title || name || 'Product';
    this.name = this.title;
    this.desc = desc || subtitle || '';
    this.subtitle = this.desc;
    this.price = Number(price) || 0;
    this.mrp = Number(mrp) || this.price;
    this.quantity = Math.max(1, Math.min(10, Number(quantity) || 1));
    this.image = image || '';
  }

  toJSON() {
    return {
      id: this.id,
      productId: this.productId,
      product_id: this.productId,
      title: this.title,
      name: this.name,
      desc: this.desc,
      subtitle: this.desc,
      plan: this.plan,
      plan_id: this.plan_id,
      price: this.price,
      mrp: this.mrp,
      quantity: this.quantity,
      image: this.image,
    };
  }
}

export class Cart {
  constructor({
    userId,
    items = [],
    coupon_code = null,
    discount = 0,
    created_at,
    updated_at,
  }) {
    this.userId = String(userId);
    this.items = Array.isArray(items)
      ? items.map((item) => (item instanceof CartItem ? item : new CartItem(item)))
      : [];
    this.coupon_code = coupon_code ? String(coupon_code).trim().toUpperCase() : null;
    this.discount = Math.max(0, Number(discount) || 0);
    this.created_at = created_at || new Date().toISOString();
    this.updated_at = updated_at || new Date().toISOString();
  }

  get subtotal() {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  get total_mrp() {
    return this.items.reduce((sum, item) => sum + (item.mrp || item.price) * item.quantity, 0);
  }

  get itemCount() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  get savings() {
    const rawSavings = this.total_mrp - this.subtotal;
    return Math.max(0, rawSavings) + this.discount;
  }

  get total() {
    const finalAmount = this.subtotal - this.discount;
    return Math.max(0, finalAmount);
  }

  addItem(cartItem) {
    const existingIndex = this.items.findIndex((item) => item.id === cartItem.id);
    if (existingIndex >= 0) {
      const nextQuantity = Math.min(10, this.items[existingIndex].quantity + cartItem.quantity);
      this.items[existingIndex].quantity = nextQuantity;
    } else {
      this.items.push(cartItem);
    }
    this.updated_at = new Date().toISOString();
    this._revalidateCoupon();
  }

  setQuantity(id, quantity) {
    const cleanId = String(id).trim();
    const qty = Number(quantity);
    if (qty <= 0) {
      this.removeItem(cleanId);
      return;
    }
    const item = this.items.find((item) => item.id === cleanId);
    if (item) {
      item.quantity = Math.max(1, Math.min(10, qty));
      this.updated_at = new Date().toISOString();
      this._revalidateCoupon();
    }
  }

  removeItem(id) {
    const cleanId = String(id).trim();
    this.items = this.items.filter((item) => item.id !== cleanId);
    this.updated_at = new Date().toISOString();
    this._revalidateCoupon();
  }

  clear() {
    this.items = [];
    this.coupon_code = null;
    this.discount = 0;
    this.updated_at = new Date().toISOString();
  }

  applyCoupon(code) {
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) {
      throw new BadRequestError('Coupon code is required.');
    }

    if (this.subtotal < 999 && (cleanCode === 'FIRSTDR' || cleanCode === 'GROW15')) {
      throw new BadRequestError('Add items worth ₹999 to use this coupon.');
    }

    if (cleanCode === 'FIRSTDR') {
      this.coupon_code = 'FIRSTDR';
      this.discount = 200;
    } else if (cleanCode === 'GROW15') {
      this.coupon_code = 'GROW15';
      this.discount = Math.round(this.subtotal * 0.15);
    } else if (cleanCode === 'SERUM300') {
      if (this.subtotal < 2000) {
        throw new BadRequestError('Add items worth ₹2000 to use this coupon.');
      }
      this.coupon_code = 'SERUM300';
      this.discount = 300;
    } else {
      throw new BadRequestError('Invalid or expired coupon code.');
    }
    this.updated_at = new Date().toISOString();
  }

  removeCoupon() {
    this.coupon_code = null;
    this.discount = 0;
    this.updated_at = new Date().toISOString();
  }

  _revalidateCoupon() {
    if (!this.coupon_code) return;
    if (this.subtotal < 999 && (this.coupon_code === 'FIRSTDR' || this.coupon_code === 'GROW15')) {
      this.removeCoupon();
    } else if (this.subtotal < 2000 && this.coupon_code === 'SERUM300') {
      this.removeCoupon();
    } else if (this.coupon_code === 'GROW15') {
      this.discount = Math.round(this.subtotal * 0.15);
    }
  }

  toJSON() {
    return {
      userId: this.userId,
      items: this.items.map((i) => i.toJSON()),
      item_count: this.itemCount,
      itemCount: this.itemCount,
      subtotal: this.subtotal,
      total_mrp: this.total_mrp,
      totalMrp: this.total_mrp,
      discount: this.discount,
      savings: this.savings,
      total: this.total,
      coupon_code: this.coupon_code,
      couponCode: this.coupon_code,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
