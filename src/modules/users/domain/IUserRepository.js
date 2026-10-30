/**
 * User Repository Interface (Contract)
 */
export class IUserRepository {
  async findById(id) {
    throw new Error('Method not implemented');
  }

  async findByLogin(login) {
    throw new Error('Method not implemented');
  }

  async findByEmail(email) {
    throw new Error('Method not implemented');
  }

  async findByPhone(phone) {
    throw new Error('Method not implemented');
  }

  async create(userEntity) {
    throw new Error('Method not implemented');
  }

  async update(id, updateData) {
    throw new Error('Method not implemented');
  }

  async updateAvatar(id, avatarUrl) {
    throw new Error('Method not implemented');
  }
}

