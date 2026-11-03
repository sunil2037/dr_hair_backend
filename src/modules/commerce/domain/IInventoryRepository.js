export class IInventoryRepository {
  async recordMovement({ productId, quantity, referenceType, referenceId, notes, createdBy }) {
    throw new Error('Method not implemented');
  }

  async reserveStock(items, orderId) {
    throw new Error('Method not implemented');
  }

  async releaseStock(items, orderId) {
    throw new Error('Method not implemented');
  }

  async restock(productId, quantity, notes, createdBy) {
    throw new Error('Method not implemented');
  }

  async getStock(productId) {
    throw new Error('Method not implemented');
  }

  async listLedger({ productId, page, limit }) {
    throw new Error('Method not implemented');
  }
}
