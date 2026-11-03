export class IOrderRepository {
  async create(order) {
    throw new Error('Method not implemented');
  }

  async findById(orderId) {
    throw new Error('Method not implemented');
  }

  async findByIdempotencyKey(key, userId) {
    throw new Error('Method not implemented');
  }

  async listByUserId(userId, options) {
    throw new Error('Method not implemented');
  }

  async listAdmin(options) {
    throw new Error('Method not implemented');
  }

  async update(orderId, patch) {
    throw new Error('Method not implemented');
  }
}
