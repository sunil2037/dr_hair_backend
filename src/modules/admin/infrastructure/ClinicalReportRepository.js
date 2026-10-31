import { ClinicalReportModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class ClinicalReportRepository {
  async create(report) {
    if (isMongoConnected()) return (await ClinicalReportModel.create(report)).toObject();
    const record = {
      ...report,
      visibility: report.visibility || 'Private',
      shared_at: report.shared_at || null,
      visibility_history: report.visibility_history || [],
      created_at: new Date().toISOString(),
    };
    store.clinicalReports.unshift(record);
    return record;
  }

  async listByUserId(userId) {
    if (isMongoConnected()) {
      return ClinicalReportModel.find({ userId: Number(userId), deleted_at: null }).sort({ created_at: -1 }).lean();
    }
    return store.clinicalReports.filter((report) => Number(report.userId) === Number(userId) && !report.deleted_at);
  }

  async listSharedByUserId(userId) {
    if (isMongoConnected()) {
      return ClinicalReportModel.find({ userId: Number(userId), visibility: 'Shared', deleted_at: null }).sort({ created_at: -1 }).lean();
    }
    return store.clinicalReports.filter((report) => Number(report.userId) === Number(userId) && report.visibility === 'Shared' && !report.deleted_at);
  }

  async listArchivedByUserId(userId) {
    if (isMongoConnected()) return ClinicalReportModel.find({ userId: Number(userId), deleted_at: { $ne: null } }).sort({ deleted_at: -1 }).lean();
    return store.clinicalReports.filter((report) => Number(report.userId) === Number(userId) && Boolean(report.deleted_at)).sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
  }

  async findByUserIdAndId(userId, id) {
    if (isMongoConnected()) return ClinicalReportModel.findOne({ userId: Number(userId), id, deleted_at: null }).lean();
    return store.clinicalReports.find((report) => Number(report.userId) === Number(userId) && report.id === id && !report.deleted_at) || null;
  }

  async findArchivedByUserIdAndId(userId, id) {
    if (isMongoConnected()) return ClinicalReportModel.findOne({ userId: Number(userId), id, deleted_at: { $ne: null } }).lean();
    return store.clinicalReports.find((report) => Number(report.userId) === Number(userId) && report.id === id && Boolean(report.deleted_at)) || null;
  }

  async archiveByUserIdAndId(userId, id, deletedBy = '') {
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const event = { action: 'archived', visibility: 'Private', changed_by: deletedBy, changed_at: now, patient_consent_confirmed: false };
    if (isMongoConnected()) return ClinicalReportModel.findOneAndUpdate(
      { userId: Number(userId), id, deleted_at: null },
      { $set: { deleted_at: now, purge_after: purgeAfter, deleted_by: deletedBy, visibility: 'Private', shared_at: null }, $push: { visibility_history: event } },
      { new: true, runValidators: true },
    ).lean();
    const report = store.clinicalReports.find((item) => Number(item.userId) === Number(userId) && item.id === id && !item.deleted_at);
    if (!report) return null;
    Object.assign(report, { deleted_at: now.toISOString(), purge_after: purgeAfter.toISOString(), deleted_by: deletedBy, visibility: 'Private', shared_at: null });
    report.visibility_history = [...(report.visibility_history || []), { ...event, changed_at: now.toISOString() }];
    return { ...report };
  }

  async restoreByUserIdAndId(userId, id) {
    const now = new Date();
    const event = { action: 'restored', visibility: 'Private', changed_by: 'Super Admin', changed_at: now, patient_consent_confirmed: false };
    if (isMongoConnected()) return ClinicalReportModel.findOneAndUpdate(
      { userId: Number(userId), id, deleted_at: { $ne: null }, purge_after: { $gt: now } },
      { $set: { deleted_at: null, purge_after: null, deleted_by: '' }, $push: { visibility_history: event } },
      { new: true, runValidators: true },
    ).lean();
    const report = store.clinicalReports.find((item) => Number(item.userId) === Number(userId) && item.id === id && item.deleted_at && new Date(item.purge_after) > now);
    if (!report) return null;
    Object.assign(report, { deleted_at: null, purge_after: null, deleted_by: '' });
    report.visibility_history = [...(report.visibility_history || []), { ...event, changed_at: now.toISOString() }];
    return { ...report };
  }

  async listExpiredArchives(now = new Date(), limit = 100) {
    if (isMongoConnected()) return ClinicalReportModel.find({ deleted_at: { $ne: null }, purge_after: { $lte: now } }).sort({ purge_after: 1 }).limit(limit).lean();
    return store.clinicalReports.filter((item) => item.deleted_at && item.purge_after && new Date(item.purge_after) <= now).slice(0, limit);
  }

  async purgeArchived(userId, id) {
    if (isMongoConnected()) return ClinicalReportModel.findOneAndDelete({ userId: Number(userId), id, deleted_at: { $ne: null }, purge_after: { $lte: new Date() } }).lean();
    const index = store.clinicalReports.findIndex((item) => Number(item.userId) === Number(userId) && item.id === id && item.deleted_at && new Date(item.purge_after) <= new Date());
    return index < 0 ? null : store.clinicalReports.splice(index, 1)[0];
  }

  async updateVisibility(userId, id, visibility, changedBy = '', patientConsentConfirmed = false) {
    const sharedAt = visibility === 'Shared' ? new Date() : null;
    const currentVisibility = await this.findByUserIdAndId(userId, id);
    if (!currentVisibility) return null;
    if ((currentVisibility.visibility || 'Private') === visibility) return currentVisibility;
    const event = { action: visibility === 'Shared' ? 'shared' : 'hidden', visibility, changed_by: changedBy, changed_at: new Date(), patient_consent_confirmed: patientConsentConfirmed };
    if (isMongoConnected()) {
      return ClinicalReportModel.findOneAndUpdate(
        { userId: Number(userId), id, deleted_at: null },
        { $set: { visibility, shared_at: sharedAt }, $push: { visibility_history: event } },
        { new: true, runValidators: true },
      ).lean();
    }
    const report = store.clinicalReports.find((item) => Number(item.userId) === Number(userId) && item.id === id);
    if (!report) return null;
    report.visibility = visibility;
    report.shared_at = sharedAt?.toISOString() || null;
    report.visibility_history = [...(report.visibility_history || []), { ...event, changed_at: event.changed_at.toISOString() }];
    return { ...report };
  }
}
