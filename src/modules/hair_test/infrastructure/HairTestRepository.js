import { IHairTestRepository } from '../domain/IHairTestRepository.js';
import { HairTest } from '../domain/HairTest.js';
import { store } from '../../../shared/database/store.js';

export class HairTestRepository extends IHairTestRepository {
  async create(data) {
    const newId = store.hairTests.length > 0 ? Math.max(...store.hairTests.map((t) => t.id)) + 1 : 101;
    const year = new Date().getFullYear();
    const referenceNo = `HT-${year}-${String(newId).padStart(4, '0')}`;

    const newRecord = {
      ...data,
      id: newId,
      reference_no: referenceNo,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };

    store.hairTests.push(newRecord);
    return new HairTest(newRecord);
  }

  async findByUserId(userId) {
    const numericId = parseInt(userId, 10);
    const tests = store.hairTests.filter((t) => t.userId === numericId);
    return tests.map((t) => new HairTest(t));
  }

  async findByReferenceNo(referenceNo) {
    const test = store.hairTests.find((t) => t.reference_no === referenceNo);
    return test ? new HairTest(test) : null;
  }
}

