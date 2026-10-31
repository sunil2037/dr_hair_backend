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

  async findByIdAndUserId(assessmentId, userId) {
    const numericAssessmentId = Number(assessmentId);
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericAssessmentId) || !Number.isSafeInteger(numericUserId)) return null;
    if (isMongoConnected()) {
      return toHairTest(await HairTestModel.findOne({ id: numericAssessmentId, userId: numericUserId }).lean());
    }
    const record = store.hairTests.find((item) => Number(item.id) === numericAssessmentId && Number(item.userId) === numericUserId);
    return record ? new HairTest(record) : null;
  }

  async removeScalpPhoto(userId, assessmentId, photoIndex, expectedUrl) {
    const numericUserId = Number(userId);
    const numericAssessmentId = Number(assessmentId);
    if (!Number.isSafeInteger(numericUserId) || !Number.isSafeInteger(numericAssessmentId) || !Number.isInteger(photoIndex) || photoIndex < 0) return null;
    if (isMongoConnected()) {
      const record = await HairTestModel.findOne({ id: numericAssessmentId, userId: numericUserId }).lean();
      if (!record) return null;
      const photos = Array.isArray(record.scalp_photos) ? record.scalp_photos : [];
      const photo = photos[photoIndex];
      if (!photo || photo.url !== expectedUrl) return null;
      photos.splice(photoIndex, 1);
      const result = await HairTestModel.updateOne(
        { id: numericAssessmentId, userId: numericUserId, [`scalp_photos.${photoIndex}.url`]: expectedUrl },
        { $set: { scalp_photos: photos } },
      );
      return result.modifiedCount > 0 ? photo : null;
    }
    const record = store.hairTests.find((item) => Number(item.id) === numericAssessmentId && Number(item.userId) === numericUserId);
    if (!record) return null;
    const photos = Array.isArray(record.scalp_photos) ? record.scalp_photos : [];
    const photo = photos[photoIndex];
    if (!photo || photo.url !== expectedUrl) return null;
    record.scalp_photos = [...photos.slice(0, photoIndex), ...photos.slice(photoIndex + 1)];
    return photo;
  }

  async restoreScalpPhoto(userId, assessmentId, photoIndex, photo) {
    const numericUserId = Number(userId);
    const numericAssessmentId = Number(assessmentId);
    if (!Number.isSafeInteger(numericUserId) || !Number.isSafeInteger(numericAssessmentId) || !photo) return false;
    if (isMongoConnected()) {
      const record = await HairTestModel.findOne({ id: numericAssessmentId, userId: numericUserId }).lean();
      if (!record) return false;
      const photos = Array.isArray(record.scalp_photos) ? record.scalp_photos : [];
      if (photos.some((item) => item.file_name === photo.file_name)) return true;
      photos.splice(Math.max(0, Math.min(Number(photoIndex) || 0, photos.length)), 0, photo);
      const result = await HairTestModel.updateOne({ id: numericAssessmentId, userId: numericUserId }, { $set: { scalp_photos: photos } });
      return result.modifiedCount > 0;
    }
    const record = store.hairTests.find((item) => Number(item.id) === numericAssessmentId && Number(item.userId) === numericUserId);
    if (!record) return false;
    const photos = Array.isArray(record.scalp_photos) ? record.scalp_photos : [];
    if (photos.some((item) => item.file_name === photo.file_name)) return true;
    photos.splice(Math.max(0, Math.min(Number(photoIndex) || 0, photos.length)), 0, photo);
    record.scalp_photos = photos;
    return true;
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

