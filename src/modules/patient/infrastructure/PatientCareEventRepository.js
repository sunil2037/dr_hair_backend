import { randomUUID } from 'node:crypto';
import { PatientCareEventModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class PatientCareEventRepository {
  async listByUserId(userId, { from, to } = {}) {
    const filter = {
      userId: Number(userId),
      ...(from || to ? { event_date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
    };
    if (isMongoConnected()) {
      return PatientCareEventModel.find(filter).sort({ event_date: -1, updated_at: -1 }).lean();
    }
    return store.patientCareEvents
      .filter((item) => Number(item.userId) === Number(userId) && (!from || item.event_date >= from) && (!to || item.event_date <= to))
      .sort((a, b) => b.event_date.localeCompare(a.event_date) || b.updated_at.localeCompare(a.updated_at));
  }

  async upsert(data) {
    const userId = Number(data.userId);
    const filter = {
      userId,
      event_date: data.event_date,
      event_type: data.event_type,
      event_key: data.event_key,
    };
    const now = new Date();
    if (isMongoConnected()) {
      const update = {
        $set: { ...data, userId, updated_at: now },
        $setOnInsert: { id: randomUUID(), created_at: now },
      };
      try {
        return await PatientCareEventModel.findOneAndUpdate(
          filter,
          update,
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        ).lean();
      } catch (error) {
        if (error?.code !== 11000) throw error;
        return PatientCareEventModel.findOneAndUpdate(
          filter,
          { $set: { ...data, userId, updated_at: now } },
          { new: true, runValidators: true },
        ).lean();
      }
    }
    const existing = store.patientCareEvents.find((item) =>
      Number(item.userId) === userId && item.event_date === data.event_date &&
      item.event_type === data.event_type && item.event_key === data.event_key,
    );
    if (existing) {
      Object.assign(existing, data, { userId, updated_at: now.toISOString() });
      return existing;
    }
    const record = {
      ...data,
      id: randomUUID(),
      userId,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    store.patientCareEvents.push(record);
    return record;
  }
}
