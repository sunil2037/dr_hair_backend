import { IAddressRepository } from '../domain/IAddressRepository.js';
import { Address } from '../domain/Address.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { AddressModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';
import { NotFoundError } from '../../../shared/errors/index.js';

export class AddressRepository extends IAddressRepository {
  async listByUserId(userId) {
    const cleanUserId = String(userId).trim();
    if (!cleanUserId) return [];

    if (isMongoConnected()) {
      const records = await AddressModel.find({ userId: cleanUserId })
        .sort({ is_default: -1, created_at: -1 })
        .lean();
      return records.map((r) => new Address(r));
    }

    if (!Array.isArray(store.addresses)) store.addresses = [];
    const list = store.addresses
      .filter((a) => String(a.userId) === cleanUserId)
      .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
    return list.map((a) => new Address(a));
  }

  async getById(userId, addressId) {
    const cleanUserId = String(userId).trim();
    const cleanId = String(addressId).trim();

    if (isMongoConnected()) {
      const record = await AddressModel.findOne({
        $or: [{ id: cleanId }, { _id: cleanId.match(/^[0-9a-fA-F]{24}$/) ? cleanId : null }],
        userId: cleanUserId,
      }).lean();
      if (!record) return null;
      return new Address(record);
    }

    if (!Array.isArray(store.addresses)) store.addresses = [];
    const found = store.addresses.find(
      (a) => String(a.userId) === cleanUserId && (a.id === cleanId || a._id === cleanId),
    );
    if (!found) return null;
    return new Address(found);
  }

  async create(userId, addressData) {
    const cleanUserId = String(userId).trim();
    const existing = await this.listByUserId(cleanUserId);
    const shouldBeDefault = Boolean(addressData.is_default ?? addressData.isDefault) || existing.length === 0;

    const address = new Address({
      ...addressData,
      userId: cleanUserId,
      is_default: shouldBeDefault,
    });

    if (isMongoConnected()) {
      if (shouldBeDefault) {
        await AddressModel.updateMany({ userId: cleanUserId }, { $set: { is_default: false } });
      }
      await AddressModel.create(address.toJSON());
      return address;
    }

    if (!Array.isArray(store.addresses)) store.addresses = [];
    if (shouldBeDefault) {
      store.addresses.forEach((a) => {
        if (String(a.userId) === cleanUserId) a.is_default = false;
      });
    }
    store.addresses.push(address.toJSON());
    return address;
  }

  async update(userId, addressId, patch) {
    const existing = await this.getById(userId, addressId);
    if (!existing) {
      throw new NotFoundError('Address not found');
    }

    const cleanUserId = String(userId).trim();
    const shouldBeDefault = patch.is_default ?? patch.isDefault;

    const updated = new Address({
      ...existing.toJSON(),
      ...patch,
      userId: cleanUserId,
      id: existing.id,
      updated_at: new Date().toISOString(),
    });

    if (isMongoConnected()) {
      if (shouldBeDefault) {
        await AddressModel.updateMany(
          { userId: cleanUserId, id: { $ne: existing.id } },
          { $set: { is_default: false } },
        );
      }
      await AddressModel.findOneAndUpdate(
        { id: existing.id, userId: cleanUserId },
        { $set: updated.toJSON() },
        { new: true },
      );
      return updated;
    }

    if (!Array.isArray(store.addresses)) store.addresses = [];
    if (shouldBeDefault) {
      store.addresses.forEach((a) => {
        if (String(a.userId) === cleanUserId && a.id !== existing.id) {
          a.is_default = false;
        }
      });
    }
    const idx = store.addresses.findIndex((a) => String(a.userId) === cleanUserId && a.id === existing.id);
    if (idx >= 0) {
      store.addresses[idx] = updated.toJSON();
    }
    return updated;
  }

  async delete(userId, addressId) {
    const existing = await this.getById(userId, addressId);
    if (!existing) {
      throw new NotFoundError('Address not found');
    }

    const cleanUserId = String(userId).trim();
    if (isMongoConnected()) {
      await AddressModel.deleteOne({ id: existing.id, userId: cleanUserId });
      if (existing.is_default) {
        // promote latest remaining address to default
        const remaining = await AddressModel.findOne({ userId: cleanUserId }).sort({ created_at: -1 });
        if (remaining) {
          remaining.is_default = true;
          await remaining.save();
        }
      }
      return true;
    }

    if (!Array.isArray(store.addresses)) store.addresses = [];
    const idx = store.addresses.findIndex((a) => String(a.userId) === cleanUserId && a.id === existing.id);
    if (idx >= 0) {
      store.addresses.splice(idx, 1);
    }
    if (existing.is_default) {
      const remaining = store.addresses.find((a) => String(a.userId) === cleanUserId);
      if (remaining) remaining.is_default = true;
    }
    return true;
  }

  async setDefault(userId, addressId) {
    return this.update(userId, addressId, { is_default: true });
  }
}
