import { ITreatmentRepository } from '../domain/ITreatmentRepository.js';
import { Treatment } from '../domain/Treatment.js';
import { store } from '../../../shared/database/store.js';

export class TreatmentRepository extends ITreatmentRepository {
  async findByTestIdentifier(referenceNoOrId) {
    const search = String(referenceNoOrId).trim();
    const treatments = store.treatments.filter(
      (t) =>
        t.reference_no === search ||
        String(t.test_id) === search ||
        String(t.id) === search
    );

    return treatments.map((t) => new Treatment(t));
  }

  async create(treatmentData) {
    const newId = store.treatments.length > 0 ? Math.max(...store.treatments.map((t) => t.id)) + 1 : 1;
    const newRecord = {
      ...treatmentData,
      id: newId,
      date: treatmentData.date || new Date().toISOString().split('T')[0],
    };

    store.treatments.push(newRecord);
    return new Treatment(newRecord);
  }
}

