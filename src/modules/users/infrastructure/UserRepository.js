import { IUserRepository } from '../domain/IUserRepository.js';
import { User } from '../domain/User.js';
import { store } from '../../../shared/database/store.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { UserModel, nextId } from '../../../shared/database/models.js';

const toUser = (record) => {
  if (!record) return null;
  return new User(typeof record.toObject === 'function' ? record.toObject() : record);
};
const cleanEmail = (email) => String(email || '').trim().toLowerCase();
const cleanPhone = (phone) => String(phone || '').replace(/\D/g, '');
const escapeRegex = (value) => value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

export class UserRepository extends IUserRepository {
  async findById(id) {
    const numericId = parseInt(id, 10);
    if (isMongoConnected()) return toUser(await UserModel.findOne({ id: numericId }).lean());
    const user = store.users.find((u) => u.id === numericId);
    return user ? new User(user) : null;
  }

  async findByLogin(login) {
    if (!login) return null;
    const clean = String(login).trim().toLowerCase();
    if (isMongoConnected()) {
      const filters = [{ email: clean }];
      const digits = cleanPhone(clean);
      if (digits) filters.push({ phoneNormalized: digits });
      return toUser(await UserModel.findOne({ $or: filters }).lean());
    }
    const user = store.users.find(
      (u) =>
        (u.email && u.email.toLowerCase() === clean) ||
        (u.phone && u.phone.replace(/[^0-9]/g, '') === clean.replace(/[^0-9]/g, ''))
    );
    return user ? new User(user) : null;
  }

  async findByEmail(email) {
    if (!email) return null;
    const clean = cleanEmail(email);
    if (isMongoConnected()) return toUser(await UserModel.findOne({ email: clean }).lean());
    const user = store.users.find((u) => u.email && u.email.toLowerCase() === clean);
    return user ? new User(user) : null;
  }

  async findByPhone(phone) {
    if (!phone) return null;
    const clean = cleanPhone(phone);
    if (isMongoConnected()) return toUser(await UserModel.findOne({ phoneNormalized: clean }).lean());
    const user = store.users.find((u) => u.phone && u.phone.replace(/[^0-9]/g, '') === clean);
    return user ? new User(user) : null;
  }

  async create(userData) {
    if (isMongoConnected()) {
      return toUser(
        await UserModel.create({
          id: await nextId('users'),
          name: userData.name,
          email: cleanEmail(userData.email) || undefined,
          phone: userData.phone || undefined,
          phoneNormalized: cleanPhone(userData.phone) || undefined,
          age: userData.age,
          gender: userData.gender,
          city: userData.city,
          occupation: userData.occupation,
          platform: userData.platform || 'app',
          profile_url: userData.profile_url || null,
          role: 'user',
          created_at: new Date(),
          updated_at: new Date(),
        }),
      );
    }
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
    if (isMongoConnected()) {
      const normalized = { ...updateData, updated_at: new Date() };
      if ('email' in normalized) normalized.email = cleanEmail(normalized.email) || undefined;
      if ('phone' in normalized) normalized.phoneNormalized = cleanPhone(normalized.phone) || undefined;
      return toUser(
        await UserModel.findOneAndUpdate({ id: numericId }, normalized, {
          new: true,
          runValidators: true,
        }).lean(),
      );
    }
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

  async list({ page = 1, limit = 25, search = '' } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const cleanSearch = String(search).trim();
    if (isMongoConnected()) {
      const filter = { role: 'user' };
      if (cleanSearch) {
        const expression = new RegExp(escapeRegex(cleanSearch), 'i');
        filter.$or = [{ name: expression }, { email: expression }, { phone: expression }];
      }
      const [records, total] = await Promise.all([
        UserModel.find(filter)
          .select('id name email phone age gender city occupation profile_url role created_at')
          .sort({ created_at: -1, id: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        UserModel.countDocuments(filter),
      ]);
      return { items: records.map(toUser), total, page: safePage, limit: safeLimit };
    }
    const query = cleanSearch.toLowerCase();
    const matched = store.users.filter((user) =>
      (user.role || 'user') === 'user'
      && (!query || [user.name, user.email, user.phone].some((value) => String(value || '').toLowerCase().includes(query))),
    );
    const start = (safePage - 1) * safeLimit;
    return {
      items: matched.slice(start, start + safeLimit).map((record) => new User(record)),
      total: matched.length,
      page: safePage,
      limit: safeLimit,
    };
  }
}

