import { ICartRepository } from '../domain/ICartRepository.js';
import { Cart } from '../domain/Cart.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { CartModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';

export class CartRepository extends ICartRepository {
  async getCart(userId) {
    if (!userId) return new Cart({ userId: 'guest', items: [] });
    const cleanUserId = String(userId).trim();

    if (isMongoConnected()) {
      const record = await CartModel.findOne({ userId: cleanUserId }).lean();
      if (!record) {
        return new Cart({ userId: cleanUserId, items: [] });
      }
      return new Cart({
        userId: record.userId,
        items: record.items || [],
        coupon_code: record.coupon_code,
        discount: record.discount,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    }

    if (!Array.isArray(store.carts)) store.carts = [];
    const found = store.carts.find((c) => String(c.userId) === cleanUserId);
    if (!found) {
      return new Cart({ userId: cleanUserId, items: [] });
    }
    return new Cart({
      userId: found.userId,
      items: found.items || [],
      coupon_code: found.coupon_code,
      discount: found.discount,
      created_at: found.created_at,
      updated_at: found.updated_at,
    });
  }

  async saveCart(cart) {
    const data = cart.toJSON();
    const cleanUserId = String(cart.userId).trim();

    if (isMongoConnected()) {
      await CartModel.findOneAndUpdate(
        { userId: cleanUserId },
        {
          userId: cleanUserId,
          items: data.items,
          coupon_code: data.coupon_code,
          discount: data.discount,
          updated_at: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return cart;
    }

    if (!Array.isArray(store.carts)) store.carts = [];
    const index = store.carts.findIndex((c) => String(c.userId) === cleanUserId);
    const record = {
      userId: cleanUserId,
      items: data.items,
      coupon_code: data.coupon_code,
      discount: data.discount,
      created_at: cart.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (index >= 0) {
      store.carts[index] = record;
    } else {
      store.carts.push(record);
    }
    return cart;
  }

  async clearCart(userId) {
    const cleanUserId = String(userId).trim();
    if (isMongoConnected()) {
      await CartModel.deleteOne({ userId: cleanUserId });
      return true;
    }

    if (!Array.isArray(store.carts)) store.carts = [];
    const index = store.carts.findIndex((c) => String(c.userId) === cleanUserId);
    if (index >= 0) {
      store.carts.splice(index, 1);
    }
    return true;
  }
}
