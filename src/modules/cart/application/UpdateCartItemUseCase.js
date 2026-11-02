import { BadRequestError } from '../../../shared/errors/index.js';

export class UpdateCartItemUseCase {
  constructor({ cartRepository }) {
    this.cartRepository = cartRepository;
  }

  async execute({ userId, itemId, quantity }) {
    if (!itemId) {
      throw new BadRequestError('Item ID is required.');
    }

    const cart = await this.cartRepository.getCart(userId);
    cart.setQuantity(itemId, quantity);
    await this.cartRepository.saveCart(cart);
    return cart.toJSON();
  }
}
