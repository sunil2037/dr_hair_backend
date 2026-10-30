import { ITreatmentRepository } from '../domain/ITreatmentRepository.js';
import { Treatment } from '../domain/Treatment.js';
import { store } from '../../../shared/database/store.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { TreatmentModel, nextId } from '../../../shared/database/models.js';

const toTreatment = (record) => {
  if (!record) return null;
  return new Treatment(typeof record.toObject === 'function' ? record.toObject() : record);
};

export class TreatmentRepository extends ITreatmentRepository {
  async findByTestIdentifier(referenceNoOrId, { userId } = {}) {
    const search = String(referenceNoOrId).trim();
    if (isMongoConnected()) {
      const numeric = Number(search);
      const filters = [{ reference_no: search }];
      if (Number.isFinite(numeric)) filters.push({ test_id: numeric }, { id: numeric });
      const query = { $or: filters };
      if (userId !== undefined) query.userId = Number(userId);
      const records = await TreatmentModel.find(query).sort({ date: -1 }).lean();
      return records.map(toTreatment);
    }
    const treatments = store.treatments.filter(
      (t) =>
        t.reference_no === search ||
        String(t.test_id) === search ||
        String(t.id) === search
    ).filter((t) =>
      userId === undefined || Number(t.userId) === Number(userId),
    );

    return treatments.map((t) => new Treatment(t));
  }

  async create(treatmentData) {
    if (isMongoConnected()) {
      return toTreatment(
        await TreatmentModel.create({
          ...treatmentData,
          id: await nextId('treatments'),
          date: treatmentData.date || new Date().toISOString().split('T')[0],
        }),
      );
    }
    const newId = store.treatments.length > 0 ? Math.max(...store.treatments.map((t) => t.id)) + 1 : 1;
    const newRecord = {
      ...treatmentData,
      id: newId,
      date: treatmentData.date || new Date().toISOString().split('T')[0],
    };

    store.treatments.push(newRecord);
    return new Treatment(newRecord);
  }

  async list({ page = 1, limit = 25 } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    if (isMongoConnected()) {
      const [records, total] = await Promise.all([
        TreatmentModel.find().sort({ date: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
        TreatmentModel.countDocuments(),
      ]);
      return { items: records.map(toTreatment), total, page: safePage, limit: safeLimit };
    }
    const start = (safePage - 1) * safeLimit;
    return {
      items: store.treatments.slice(start, start + safeLimit).map((record) => new Treatment(record)),
      total: store.treatments.length,
      page: safePage,
      limit: safeLimit,
    };
  }
}

