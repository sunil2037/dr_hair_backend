import { IHairTestRepository } from '../domain/IHairTestRepository.js';
import { HairTest } from '../domain/HairTest.js';
import { store } from '../../../shared/database/store.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { HairTestModel, HairTestDraftModel, nextId } from '../../../shared/database/models.js';
import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';

const VALID_TRANSITIONS = {
  draft: ['submitted', 'archived'],
  submitted: ['under_review', 'reviewed', 'archived'],
  under_review: ['reviewed', 'submitted', 'archived'],
  reviewed: ['archived'],
  archived: [],
};

const toHairTest = (record) => {
  if (!record) return null;
  return new HairTest(typeof record.toObject === 'function' ? record.toObject() : record);
};

export class HairTestRepository extends IHairTestRepository {
  async create(data) {
    const status = data.status || 'submitted';
    const statusHistory = Array.isArray(data.status_history) && data.status_history.length > 0
      ? data.status_history
      : [{
          status,
          changed_at: new Date().toISOString(),
          changed_by: data.changed_by || 'Patient',
          note: data.note || 'Assessment submitted',
        }];

    if (isMongoConnected()) {
      const id = await nextId('hairTests', 100);
      const year = new Date().getFullYear();
      const record = await HairTestModel.create({
        ...data,
        status,
        status_history: statusHistory,
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
      status,
      status_history: statusHistory,
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
      const records = await HairTestModel.find({ userId: numericId, status: { $ne: 'draft' } }).sort({ created_at: -1 }).lean();
      return records.map(toHairTest);
    }
    const tests = store.hairTests.filter((t) => t.userId === numericId && t.status !== 'draft');
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

  async updateStatus(referenceNo, newStatus, { changed_by = '', note = '' } = {}) {
    const validStatuses = Object.keys(VALID_TRANSITIONS);
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestError(`Invalid assessment status: ${newStatus}. Allowed: ${validStatuses.join(', ')}.`);
    }

    if (isMongoConnected()) {
      const record = await HairTestModel.findOne({ reference_no: referenceNo });
      if (!record) throw new NotFoundError('Assessment not found for that reference number.');

      const currentStatus = record.status || 'submitted';
      const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
      if (currentStatus !== newStatus && !allowedNext.includes(newStatus)) {
        throw new BadRequestError(`Cannot transition assessment status from ${currentStatus} to ${newStatus}. Allowed transitions: ${allowedNext.join(', ') || 'none'}.`);
      }

      const historyEntry = {
        status: newStatus,
        changed_at: new Date(),
        changed_by: String(changed_by || '').trim(),
        note: String(note || '').trim(),
      };

      record.status = newStatus;
      if (!Array.isArray(record.status_history)) record.status_history = [];
      record.status_history.push(historyEntry);
      await record.save();
      return toHairTest(record);
    }

    const test = store.hairTests.find((t) => t.reference_no === referenceNo);
    if (!test) throw new NotFoundError('Assessment not found for that reference number.');

    const currentStatus = test.status || 'submitted';
    const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
    if (currentStatus !== newStatus && !allowedNext.includes(newStatus)) {
      throw new BadRequestError(`Cannot transition assessment status from ${currentStatus} to ${newStatus}. Allowed transitions: ${allowedNext.join(', ') || 'none'}.`);
    }

    const historyEntry = {
      status: newStatus,
      changed_at: new Date().toISOString(),
      changed_by: String(changed_by || '').trim(),
      note: String(note || '').trim(),
    };

    test.status = newStatus;
    if (!Array.isArray(test.status_history)) test.status_history = [];
    test.status_history.push(historyEntry);
    return new HairTest(test);
  }

  async saveDraft(userId, formData = {}, step = 0) {
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericUserId)) throw new BadRequestError('A valid numeric user id is required.');
    const safeStep = Math.max(0, parseInt(step, 10) || 0);

    if (isMongoConnected()) {
      const draft = await HairTestDraftModel.findOneAndUpdate(
        { userId: numericUserId },
        { $set: { formData, step: safeStep, updated_at: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      return { userId: draft.userId, formData: draft.formData, step: draft.step, updated_at: draft.updated_at };
    }

    if (!Array.isArray(store.hairTestDrafts)) store.hairTestDrafts = [];
    const index = store.hairTestDrafts.findIndex((d) => d.userId === numericUserId);
    const draftRecord = {
      userId: numericUserId,
      formData,
      step: safeStep,
      updated_at: new Date().toISOString(),
    };
    if (index >= 0) {
      store.hairTestDrafts[index] = draftRecord;
    } else {
      store.hairTestDrafts.push(draftRecord);
    }
    return draftRecord;
  }

  async getDraft(userId) {
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericUserId)) return null;

    if (isMongoConnected()) {
      const draft = await HairTestDraftModel.findOne({ userId: numericUserId }).lean();
      return draft ? { userId: draft.userId, formData: draft.formData, step: draft.step, updated_at: draft.updated_at } : null;
    }

    if (!Array.isArray(store.hairTestDrafts)) store.hairTestDrafts = [];
    const draft = store.hairTestDrafts.find((d) => d.userId === numericUserId);
    return draft || null;
  }

  async deleteDraft(userId) {
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericUserId)) return false;

    if (isMongoConnected()) {
      const result = await HairTestDraftModel.deleteOne({ userId: numericUserId });
      return result.deletedCount > 0;
    }

    if (!Array.isArray(store.hairTestDrafts)) store.hairTestDrafts = [];
    const index = store.hairTestDrafts.findIndex((d) => d.userId === numericUserId);
    if (index >= 0) {
      store.hairTestDrafts.splice(index, 1);
      return true;
    }
    return false;
  }

  async list({ page = 1, limit = 25, status } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const filter = status ? { status } : { status: { $ne: 'draft' } };

    if (isMongoConnected()) {
      const [records, total] = await Promise.all([
        HairTestModel.find(filter)
          .sort({ created_at: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        HairTestModel.countDocuments(filter),
      ]);
      return { items: records.map(toHairTest), total, page: safePage, limit: safeLimit };
    }

    const filtered = store.hairTests.filter((record) => {
      if (status) return record.status === status;
      return record.status !== 'draft';
    });

    const start = (safePage - 1) * safeLimit;
    return {
      items: filtered.slice(start, start + safeLimit).map((record) => new HairTest(record)),
      total: filtered.length,
      page: safePage,
      limit: safeLimit,
    };
  }
}

