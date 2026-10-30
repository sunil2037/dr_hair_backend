import { NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { createClinicalReportDownloadUrl } from '../../admin/infrastructure/ClinicalReportStorage.js';

const publicReport = (report) => ({
  id: report.id,
  title: report.title,
  file_name: report.file_name,
  mime_type: report.mime_type,
  format: report.format,
  bytes: report.bytes,
  created_at: report.created_at,
});

export class PatientClinicalController {
  constructor({ hairTestRepository, treatmentRepository, clinicalReportRepository }) {
    this.hairTestRepository = hairTestRepository;
    this.treatmentRepository = treatmentRepository;
    this.clinicalReportRepository = clinicalReportRepository;
  }

  getClinicalRecord = async (req, res, next) => {
    try {
      const userId = req.user.id;
      const [assessments, carePlans, reports] = await Promise.all([
        this.hairTestRepository.findByUserId(userId),
        this.treatmentRepository.findByUserId(userId),
        this.clinicalReportRepository.listByUserId(userId),
      ]);
      return sendSuccess(res, {
        data: {
          assessments: assessments.map((assessment) => ({ ...assessment })),
          care_plans: carePlans.map((plan) => ({ ...plan.toResponse(), reference_no: plan.reference_no })),
          reports: reports.map(publicReport),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  downloadReport = async (req, res, next) => {
    try {
      const report = await this.clinicalReportRepository.findByUserIdAndId(req.user.id, req.params.reportId);
      if (!report) throw new NotFoundError('Patient report not found.');
      return sendSuccess(res, {
        data: {
          url: createClinicalReportDownloadUrl(report.public_id, report.format),
          expires_in_seconds: 60,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
