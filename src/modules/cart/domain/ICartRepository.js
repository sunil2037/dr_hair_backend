export class ICartRepository {
  async getCart(_userId) {
    throw new Error('Not implemented');
  }

  async saveCart(_cart) {
    throw new Error('Not implemented');
  }

  async clearCart(_userId) {
    throw new Error('Not implemented');
  }
}
