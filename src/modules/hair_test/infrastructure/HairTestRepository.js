import { IHairTestRepository } from '../domain/IHairTestRepository.js';
import { HairTest } from '../domain/HairTest.js';
import { store } from '../../../shared/database/store.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { HairTestModel, nextId } from '../../../shared/database/models.js';

const toHairTest = (record) => {
  if (!record) return null;
  return new HairTest(typeof record.toObject === 'function' ? record.toObject() : record);
};

export class HairTestRepository extends IHairTestRepository {
  async create(data) {
    if (isMongoConnected()) {
      const id = await nextId('hairTests', 100);
      const year = new Date().getFullYear();
      const record = await HairTestModel.create({
        ...data,
        id,
        reference_no: 'HT-' + year + '-' + String(id).padStart(4, '0'),
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      });
      return toHairTest(record);
    }
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
    if (isMongoConnected()) {
      const records = await HairTestModel.find({ userId: numericId }).sort({ created_at: -1 }).lean();
      return records.map(toHairTest);
    }
    const tests = store.hairTests.filter((t) => t.userId === numericId);
    return tests.map((t) => new HairTest(t));
  }

  async findByReferenceNo(referenceNo) {
    if (isMongoConnected()) {
      return toHairTest(await HairTestModel.findOne({ reference_no: referenceNo }).lean());
    }
    const test = store.hairTests.find((t) => t.reference_no === referenceNo);
    return test ? new HairTest(test) : null;
  }

  async list({ page = 1, limit = 25 } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    if (isMongoConnected()) {
      const [records, total] = await Promise.all([
        HairTestModel.find()
          .sort({ created_at: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        HairTestModel.countDocuments(),
      ]);
      return { items: records.map(toHairTest), total, page: safePage, limit: safeLimit };
    }
    const start = (safePage - 1) * safeLimit;
    return {
      items: store.hairTests.slice(start, start + safeLimit).map((record) => new HairTest(record)),
      total: store.hairTests.length,
      page: safePage,
      limit: safeLimit,
    };
  }
}

