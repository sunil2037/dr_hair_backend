export class ClearCartUseCase {
  constructor({ cartRepository }) {
    this.cartRepository = cartRepository;
  }

  async execute(userId) {
    await this.cartRepository.clearCart(userId);
    const emptyCart = await this.cartRepository.getCart(userId);
    return emptyCart.toJSON();
  }
}
