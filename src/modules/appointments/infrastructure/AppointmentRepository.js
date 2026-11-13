import { AppointmentModel, ClinicClosedDateModel, nextId } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';
import { ConflictError } from '../../../shared/errors/index.js';

const plain = (value) => value && typeof value.toObject === 'function' ? value.toObject() : value;

export class AppointmentRepository {
  async create(data) {
    const sequence = isMongoConnected()
      ? await nextId('appointments')
      : store.appointments.reduce((max, item) => Math.max(max, Number(String(item.id).split('-').at(-1)) || 0), 0) + 1;
    const year = new Date(data.starts_at).getUTCFullYear();
    const now = new Date();
    const record = {
      consultation_fee: data.consultation_fee != null ? Number(data.consultation_fee) : 500,
      payment_status: data.payment_status || 'Pending',
      payment_method: data.payment_method || 'UPI',
      payment_transaction_id: data.payment_transaction_id || '',
      payment_time: data.payment_time ? new Date(data.payment_time) : (data.payment_status === 'Paid' ? now : null),
      ...data,
      id: `APT-${year}-${String(sequence).padStart(4, '0')}`,
      opd_token: data.opd_token || `OPD-${String(sequence).padStart(4, '0')}`,
      slot_key: data.status === 'Cancelled' ? undefined : data.starts_at,
      status_history: data.status_history || [],
      created_at: now,
      updated_at: now,
    };
    if (isMongoConnected()) {
      try {
        return plain(await AppointmentModel.create(record));
      } catch (error) {
        if (error?.code === 11000) throw new ConflictError('This clinic slot has just been booked. Choose another time.');
        throw error;
      }
    }
    if (record.slot_key && store.appointments.some((item) => item.slot_key === record.slot_key && item.status !== 'Cancelled')) {
      throw new ConflictError('This clinic slot is already booked. Choose another time.');
    }
    store.appointments.unshift(record);
    return record;
  }

  async findById(id, userId) {
    if (isMongoConnected()) {
      const filter = { id: String(id), ...(userId == null ? {} : { userId: Number(userId) }) };
      return plain(await AppointmentModel.findOne(filter).lean());
    }
    return store.appointments.find((item) => item.id === String(id) && (userId == null || Number(item.userId) === Number(userId))) || null;
  }

  async findSlot(startsAt, exceptId = '') {
    if (isMongoConnected()) {
      return plain(await AppointmentModel.findOne({ slot_key: startsAt, status: { $ne: 'Cancelled' }, ...(exceptId ? { id: { $ne: String(exceptId) } } : {}) }).lean());
    }
    return store.appointments.find((item) => item.slot_key === startsAt && item.id !== String(exceptId) && item.status !== 'Cancelled') || null;
  }

  async listByPatient(userId) {
    if (isMongoConnected()) return AppointmentModel.find({ userId: Number(userId) }).sort({ starts_at: -1 }).lean();
    return store.appointments.filter((item) => Number(item.userId) === Number(userId)).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }

  async list({ from, to, status, payment_status, limit = 500 } = {}) {
    const safeLimit = Math.max(1, Math.min(250, Number(limit) || 100));
    const filter = {};
    if (from || to) {
      filter.starts_at = {};
      if (from) filter.starts_at.$gte = from;
      if (to) filter.starts_at.$lte = to;
    }
    if (status) filter.status = status;
    if (payment_status) filter.payment_status = payment_status;
    if (isMongoConnected()) return AppointmentModel.find(filter).sort({ starts_at: 1 }).limit(safeLimit).lean();
    return store.appointments
      .filter((item) => (!from || item.starts_at >= from) && (!to || item.starts_at <= to) && (!status || item.status === status) && (!payment_status || item.payment_status === payment_status))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, safeLimit);
  }

  async update(id, patch, event, userId) {
    const now = new Date();
    const update = { $set: { ...patch, updated_at: now }, $push: { status_history: { ...event, changed_at: now } } };
    if (isMongoConnected()) {
      try {
        const baseFilter = { id: String(id), ...(userId == null ? {} : { userId: Number(userId) }) };
        const current = await AppointmentModel.findOne(baseFilter).select('starts_at status').lean();
        if (!current) return null;
        if (patch.status === 'Cancelled') update.$unset = { slot_key: 1 };
        else update.$set.slot_key = patch.starts_at || current.starts_at;
        const updated = await AppointmentModel.findOneAndUpdate(
          { ...baseFilter, starts_at: current.starts_at, status: current.status },
          update,
          { new: true, runValidators: true },
        ).lean();
        if (!updated) throw new ConflictError('The appointment changed at the same time. Refresh and try again.');
        return plain(updated);
      } catch (error) {
        if (error?.code === 11000) throw new ConflictError('This clinic slot has just been booked. Choose another time.');
        throw error;
      }
    }
    const record = store.appointments.find((item) => item.id === String(id) && (userId == null || Number(item.userId) === Number(userId)));
    if (!record) return null;
    if (patch.starts_at && store.appointments.some((item) => item.id !== String(id) && item.slot_key === patch.starts_at && item.status !== 'Cancelled')) {
      throw new ConflictError('This clinic slot is already booked. Choose another time.');
    }
    Object.assign(record, patch, { updated_at: now.toISOString() });
    if (patch.status === 'Cancelled') {
      delete record.slot_key;
    } else if (patch.starts_at) {
      record.slot_key = patch.starts_at;
    }
    record.status_history = [...(record.status_history || []), { ...event, changed_at: now.toISOString() }];
    return record;
  }

  async listActiveByClinicDate(date) {
    const startsAt = new Date(`${date}T00:00:00+05:30`).toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
    if (isMongoConnected()) {
      return AppointmentModel.find({
        starts_at: { $gte: startsAt, $lt: endsAt },
        status: { $ne: 'Cancelled' },
      }).sort({ starts_at: 1 }).select('id patient_code userId starts_at status').lean();
    }
    return store.appointments.filter((item) => item.starts_at >= startsAt && item.starts_at < endsAt && item.status !== 'Cancelled');
  }

  async listClosedDates() {
    if (isMongoConnected()) return ClinicClosedDateModel.find().sort({ date: 1 }).lean();
    return [...store.clinicClosedDates].sort((a, b) => a.date.localeCompare(b.date));
  }

  async addClosedDate({ date, reason = '', created_by = '' }) {
    if (isMongoConnected()) {
      try { return (await ClinicClosedDateModel.create({ date, reason, created_by })).toObject(); }
      catch (error) { if (error?.code === 11000) throw new ConflictError('The clinic is already closed on this date.'); throw error; }
    }
    if (store.clinicClosedDates.some((item) => item.date === date)) throw new ConflictError('The clinic is already closed on this date.');
    const record = { date, reason, created_by, created_at: new Date().toISOString() };
    store.clinicClosedDates.push(record);
    return record;
  }

  async removeClosedDate(date) {
    if (isMongoConnected()) {
      const result = await ClinicClosedDateModel.deleteOne({ date });
      return result.deletedCount > 0;
    }
    const index = store.clinicClosedDates.findIndex((item) => item.date === date);
    if (index < 0) return false;
    store.clinicClosedDates.splice(index, 1);
    return true;
  }
}
