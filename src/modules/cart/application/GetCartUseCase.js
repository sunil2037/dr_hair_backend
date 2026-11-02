export class GetCartUseCase {
  constructor({ cartRepository }) {
    this.cartRepository = cartRepository;
  }

  async execute(userId) {
    const cart = await this.cartRepository.getCart(userId);
    return cart.toJSON();
  }
}
