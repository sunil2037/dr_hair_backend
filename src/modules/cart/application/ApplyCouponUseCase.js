import { BadRequestError } from '../../../shared/errors/index.js';

export class ApplyCouponUseCase {
  constructor({ cartRepository }) {
    this.cartRepository = cartRepository;
  }

  async execute({ userId, code }) {
    if (!code) {
      throw new BadRequestError('Coupon code is required.');
    }

    const cart = await this.cartRepository.getCart(userId);
    cart.applyCoupon(code);
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
