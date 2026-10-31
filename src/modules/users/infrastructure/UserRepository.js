import { IUserRepository } from '../domain/IUserRepository.js';
import { User } from '../domain/User.js';
import { store } from '../../../shared/database/store.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { UserModel, nextUserId } from '../../../shared/database/models.js';
import { formatPatientCode, resolvePatientId } from '../../../shared/utils/patient-code.js';
import { ConflictError } from '../../../shared/errors/index.js';

const toUser = (record) => {
  if (!record) return null;
  return new User(typeof record.toObject === 'function' ? record.toObject() : record);
};
const cleanEmail = (email) => String(email || '').trim().toLowerCase();
const cleanPhone = (phone) => String(phone || '').replace(/\D/g, '');
const escapeRegex = (value) => value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

export class UserRepository extends IUserRepository {
  async findById(id) {
    const numericId = resolvePatientId(id);
    if (!numericId) return null;
    if (isMongoConnected()) {
      const record = await UserModel.findOne({ id: numericId }).lean();
      if (!record) return null;
      if (!record.patient_code) {
        record.patient_code = formatPatientCode(record.id);
        await UserModel.updateOne(
          { id: numericId, $or: [{ patient_code: { $exists: false } }, { patient_code: null }, { patient_code: '' }] },
          { $set: { patient_code: record.patient_code } },
        );
      }
      return toUser(record);
    }
    const user = store.users.find((u) => u.id === numericId);
    if (!user) return null;
    user.patient_code ||= formatPatientCode(user.id);
    return new User(user);
  }

  async findByLogin(login) {
    if (!login) return null;
    const clean = String(login).trim().toLowerCase();
    if (isMongoConnected()) {
      const filters = [{ email: clean }];
      const digits = clean.includes('@') ? '' : cleanPhone(clean);
      if (digits) filters.push({ phoneNormalized: digits });
      const record = await UserModel.findOne({ $or: filters }).select('id').lean();
      return record ? this.findById(record.id) : (digits ? this.findByPhone(digits) : null);
    }
    const user = store.users.find(
      (u) =>
        (u.email && u.email.toLowerCase() === clean) ||
        (u.phone && u.phone.replace(/[^0-9]/g, '') === clean.replace(/[^0-9]/g, ''))
    );
    return user ? this.findById(user.id) : null;
  }

  async findByEmail(email) {
    if (!email) return null;
    const clean = cleanEmail(email);
    if (isMongoConnected()) {
      const record = await UserModel.findOne({ email: clean }).select('id').lean();
      return record ? this.findById(record.id) : null;
    }
    const user = store.users.find((u) => u.email && u.email.toLowerCase() === clean);
    return user ? this.findById(user.id) : null;
  }

  async findByPhone(phone) {
    if (!phone) return null;
    const clean = cleanPhone(phone);
    if (isMongoConnected()) {
      let record = await UserModel.findOne({ phoneNormalized: clean }).select('id').lean();
      // Older Atlas records predate phoneNormalized. Fall back once, then
      // backfill the normalized value so future lookups use the indexed path.
      if (!record) {
        const legacy = await UserModel.find({
          phone: { $exists: true, $ne: '' },
          $or: [{ phoneNormalized: { $exists: false } }, { phoneNormalized: null }, { phoneNormalized: '' }],
        })
          .select('id phone')
          .lean();
        const matches = legacy.filter((item) => cleanPhone(item.phone) === clean);
        if (matches.length > 1) throw new ConflictError('This phone number matches multiple legacy accounts. Resolve the duplicate accounts before signing in.');
        if (matches.length === 1) {
          record = matches[0];
          await UserModel.updateOne(
            { id: record.id, $or: [{ phoneNormalized: { $exists: false } }, { phoneNormalized: null }, { phoneNormalized: '' }] },
            { $set: { phoneNormalized: clean } },
          ).catch(() => {});
        }
      }
      return record ? this.findById(record.id) : null;
    }
    const user = store.users.find((u) => u.phone && u.phone.replace(/[^0-9]/g, '') === clean);
    return user ? this.findById(user.id) : null;
  }

  async findByIds(ids = []) {
    const numericIds = [...new Set(ids.map((id) => Number(id)).filter(Number.isSafeInteger))];
    if (!numericIds.length) return [];
    if (isMongoConnected()) {
      const records = await UserModel.find({ id: { $in: numericIds } })
        .select('id patient_code name email phone age gender city occupation platform profile_url role created_at updated_at')
        .lean();
      return records.map((record) => {
        record.patient_code ||= formatPatientCode(record.id);
        return toUser(record);
      });
    }
    return (await Promise.all(numericIds.map((id) => this.findById(id)))).filter(Boolean);
  }

  async create(userData) {
    if (isMongoConnected()) {
      const id = await nextUserId();
      return toUser(
        await UserModel.create({
          id,
          patient_code: formatPatientCode(id),
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
      patient_code: formatPatientCode(newId),
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      age: userData.age,
      gender: userData.gender,
      city: userData.city,
      occupation: userData.occupation,
      platform: userData.platform || 'app',
      profile_url: userData.profile_url || null,
      role: 'user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.users.push(newUserRecord);
    return new User(newUserRecord);
  }

  async update(id, updateData) {
    const numericId = resolvePatientId(id);
    if (!numericId) return null;
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
        const exactPatientId = resolvePatientId(cleanSearch);
        filter.$or = [
          { name: expression },
          { email: expression },
          { phone: expression },
          { patient_code: expression },
          ...(exactPatientId ? [{ id: exactPatientId }] : []),
        ];
      }
      const [records, total] = await Promise.all([
        UserModel.find(filter)
          .select('id patient_code name email phone age gender city occupation platform profile_url role created_at')
          .sort({ created_at: -1, id: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        UserModel.countDocuments(filter),
      ]);
      const withoutCode = records.filter((record) => !record.patient_code);
      if (withoutCode.length) {
        await UserModel.bulkWrite(withoutCode.map((record) => ({
          updateOne: {
            filter: { id: record.id, $or: [{ patient_code: { $exists: false } }, { patient_code: null }, { patient_code: '' }] },
            update: { $set: { patient_code: formatPatientCode(record.id) } },
          },
        })));
        withoutCode.forEach((record) => { record.patient_code = formatPatientCode(record.id); });
      }
      return { items: records.map(toUser), total, page: safePage, limit: safeLimit };
    }
    const query = cleanSearch.toLowerCase();
    const matched = store.users.filter((user) =>
      (user.role || 'user') === 'user'
      && (!query || [user.name, user.email, user.phone, user.patient_code || formatPatientCode(user.id)].some((value) => String(value || '').toLowerCase().includes(query))
        || resolvePatientId(cleanSearch) === user.id),
    );
    const start = (safePage - 1) * safeLimit;
    matched.forEach((user) => { user.patient_code ||= formatPatientCode(user.id); });
    return {
      items: matched.slice(start, start + safeLimit).map((record) => new User(record)),
      total: matched.length,
      page: safePage,
      limit: safeLimit,
    };
  }
}

