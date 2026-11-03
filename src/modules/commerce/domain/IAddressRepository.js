export class IAddressRepository {
  async listByUserId(userId) {
    throw new Error('Method not implemented');
  }

  async getById(userId, addressId) {
    throw new Error('Method not implemented');
  }

  async create(address) {
    throw new Error('Method not implemented');
  }

  async update(userId, addressId, patch) {
    throw new Error('Method not implemented');
  }

  async delete(userId, addressId) {
    throw new Error('Method not implemented');
  }

  async setDefault(userId, addressId) {
    throw new Error('Method not implemented');
  }
}
