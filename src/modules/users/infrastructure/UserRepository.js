import { IUserRepository } from '../domain/IUserRepository.js';
import { User } from '../domain/User.js';
import { store } from '../../../shared/database/store.js';

export class UserRepository extends IUserRepository {
  async findById(id) {
    const numericId = parseInt(id, 10);
    const user = store.users.find((u) => u.id === numericId);
    return user ? new User(user) : null;
  }

  async findByLogin(login) {
    if (!login) return null;
    const clean = String(login).trim().toLowerCase();
    const user = store.users.find(
      (u) =>
        (u.email && u.email.toLowerCase() === clean) ||
        (u.phone && u.phone.replace(/[^0-9]/g, '') === clean.replace(/[^0-9]/g, ''))
    );
    return user ? new User(user) : null;
  }

  async findByEmail(email) {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    const user = store.users.find((u) => u.email && u.email.toLowerCase() === clean);
    return user ? new User(user) : null;
  }

  async findByPhone(phone) {
    if (!phone) return null;
    const clean = String(phone).replace(/[^0-9]/g, '');
    const user = store.users.find((u) => u.phone && u.phone.replace(/[^0-9]/g, '') === clean);
    return user ? new User(user) : null;
  }

  async create(userData) {
    const newId = store.users.length > 0 ? Math.max(...store.users.map((u) => u.id)) + 1 : 1;
    const newUserRecord = {
      id: newId,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      age: userData.age,
      gender: userData.gender,
      city: userData.city,
      occupation: userData.occupation,
      platform: userData.platform || 'app',
      profile_url: userData.profile_url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.users.push(newUserRecord);
    return new User(newUserRecord);
  }

  async update(id, updateData) {
    const numericId = parseInt(id, 10);
    const index = store.users.findIndex((u) => u.id === numericId);
    if (index === -1) return null;

    store.users[index] = {
      ...store.users[index],
      ...updateData,
      updated_at: new Date().toISOString(),
    };

    return new User(store.users[index]);
  }

  async updateAvatar(id, avatarUrl) {
    return this.update(id, { profile_url: avatarUrl });
  }
}

