import { BadRequestError } from '../../../shared/errors/index.js';

export class ApplyCouponUseCase {
  constructor({ cartRepository, couponRepository }) {
    this.cartRepository = cartRepository;
    this.couponRepository = couponRepository;
  }

  async execute({ userId, code }) {
    if (!code) {
      throw new BadRequestError('Coupon code is required.');
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cart = await this.cartRepository.getCart(userId);

    if (this.couponRepository) {
      const dynamicCoupon = await this.couponRepository.findByCode(cleanCode);
      if (dynamicCoupon) {
        if (dynamicCoupon.status !== 'Active') {
          throw new BadRequestError('This coupon is currently inactive or expired.');
        }
        if (cart.subtotal < (dynamicCoupon.minimum_order || dynamicCoupon.minimumOrder || 0)) {
          const minSpend = dynamicCoupon.minimum_order || dynamicCoupon.minimumOrder;
          throw new BadRequestError(`Add items worth ₹${minSpend} to use this coupon.`);
        }
        const discountType = dynamicCoupon.discount_type || dynamicCoupon.discountType || 'percent';
        const discountVal = Number(dynamicCoupon.discount_value ?? dynamicCoupon.discountValue ?? 0);
        const discount = discountType === 'percent'
          ? Math.round(cart.subtotal * (discountVal / 100))
          : discountVal;
        cart.coupon_code = dynamicCoupon.code;
        cart.discount = Math.min(cart.subtotal, discount);
        cart.updated_at = new Date().toISOString();
        await this.cartRepository.saveCart(cart);
        return cart.toJSON();
      }
    }

    cart.applyCoupon(cleanCode);
    await this.cartRepository.saveCart(cart);
    return cart.toJSON();
  }

  async remove({ userId }) {
    const cart = await this.cartRepository.getCart(userId);
    cart.removeCoupon();
    await this.cartRepository.saveCart(cart);
    return cart.toJSON();
  }
}
