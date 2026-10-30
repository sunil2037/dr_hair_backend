import { ClinicalReportModel } from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class ClinicalReportRepository {
  async create(report) {
    if (isMongoConnected()) return (await ClinicalReportModel.create(report)).toObject();
    const record = { ...report, created_at: new Date().toISOString() };
    store.clinicalReports.unshift(record);
    return record;
  }

  async listByUserId(userId) {
    if (isMongoConnected()) {
      return ClinicalReportModel.find({ userId: Number(userId) }).sort({ created_at: -1 }).lean();
    }
    return store.clinicalReports.filter((report) => Number(report.userId) === Number(userId));
  }

  async findByUserIdAndId(userId, id) {
    if (isMongoConnected()) return ClinicalReportModel.findOne({ userId: Number(userId), id }).lean();
    return store.clinicalReports.find((report) => Number(report.userId) === Number(userId) && report.id === id) || null;
  }
}
