import { randomUUID } from 'node:crypto';
import { PatientActivityModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class PatientActivityRepository {
  async record({ userId, patientCode = '', type, title, summary = '', actor = 'Clinic', metadata = {} }) {
    const event = {
      id: randomUUID(),
      userId: Number(userId),
      patient_code: patientCode,
      type: String(type || 'clinical').slice(0, 40),
      title: String(title || 'Patient record updated').slice(0, 120),
      summary: String(summary || '').slice(0, 500),
      actor: String(actor || 'Clinic').slice(0, 160),
      occurred_at: new Date(),
      metadata,
    };
    if (isMongoConnected()) return (await PatientActivityModel.create(event)).toObject();
    const record = { ...event, occurred_at: event.occurred_at.toISOString() };
    store.patientActivity.unshift(record);
    return record;
  }

  async listByPatient(userId, limit = 100) {
    const safeLimit = Math.max(1, Math.min(250, Number(limit) || 100));
    if (isMongoConnected()) return PatientActivityModel.find({ userId: Number(userId) }).sort({ occurred_at: -1 }).limit(safeLimit).lean();
    return store.patientActivity.filter((item) => Number(item.userId) === Number(userId)).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, safeLimit);
  }
}
