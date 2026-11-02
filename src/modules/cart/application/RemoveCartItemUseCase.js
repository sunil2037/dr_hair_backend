import { BadRequestError } from '../../../shared/errors/index.js';

export class RemoveCartItemUseCase {
  constructor({ cartRepository }) {
    this.cartRepository = cartRepository;
  }

  async execute({ userId, itemId }) {
    if (!itemId) {
      throw new BadRequestError('Item ID is required.');
    }

    const cart = await this.cartRepository.getCart(userId);
    cart.removeItem(itemId);
    await this.cartRepository.saveCart(cart);
    return cart.toJSON();
  }
}
