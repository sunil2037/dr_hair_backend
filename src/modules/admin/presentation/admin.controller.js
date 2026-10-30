import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { uploadClinicalReport, createClinicalReportDownloadUrl, deleteClinicalReport } from '../infrastructure/ClinicalReportStorage.js';

const reportResponse = (report) => ({
  id: report.id,
  userId: report.userId,
  title: report.title,
  file_name: report.file_name,
  mime_type: report.mime_type,
  format: report.format,
  bytes: report.bytes,
  uploaded_by: report.uploaded_by,
  created_at: report.created_at,
});

export class AdminController {
  constructor({ userRepository, hairTestRepository, treatmentRepository, clinicalReportRepository, reviewRepository, adminAccountRepository, createAdminAccountUseCase }) {
    this.userRepository = userRepository;
    this.hairTestRepository = hairTestRepository;
    this.treatmentRepository = treatmentRepository;
    this.clinicalReportRepository = clinicalReportRepository;
    this.reviewRepository = reviewRepository;
    this.adminAccountRepository = adminAccountRepository;
    this.createAdminAccountUseCase = createAdminAccountUseCase;
  }

  getCurrentAdmin = async (req, res, next) => {
    try {
      return sendSuccess(res, {
        data: {
          id: req.user?.id ? String(req.user.id) : null,
          email: req.user?.login || req.user?.email || null,
          name: req.user?.name || null,
          role: req.user?.role || 'admin',
        },
      });
    } catch (error) {
      next(error);
    }
  };

  listAdminAccounts = async (_req, res, next) => {
    try {
      const accounts = await this.adminAccountRepository.list();
      return sendSuccess(res, { data: { items: accounts } });
    } catch (error) {
      next(error);
    }
  };

  createAdminAccount = async (req, res, next) => {
    try {
      const result = await this.createAdminAccountUseCase.execute(req.body || {});
      return sendSuccess(res, {
        message: 'Admin account created. Copy its generated password now; it will not be shown again.',
        data: {
          admin: result.account,
          credentials: {
            login_id: result.account.email,
            password: result.generatedPassword,
          },
        },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  };

  listUsers = async (req, res, next) => {
    try {
      const result = await this.userRepository.list({
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
      });
      return sendSuccess(res, {
        data: {
          ...result,
          items: result.items.map((user) => ({
            ...user.toPublicProfile(),
            role: user.role,
            created_at: user.created_at,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getPatient = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const assessments = await this.hairTestRepository.findByUserId(patient.id);
      const treatmentsByAssessment = await Promise.all(assessments.map((assessment) =>
        this.treatmentRepository.findByTestIdentifier(assessment.reference_no, { userId: patient.id }),
      ));
      const reports = await this.clinicalReportRepository.listByUserId(patient.id);
      return sendSuccess(res, {
        data: {
          patient: { ...patient.toPublicProfile(), created_at: patient.created_at },
          assessments,
          treatments: treatmentsByAssessment.flat().map((treatment) => ({ ...treatment.toResponse(), reference_no: treatment.reference_no })),
          reports: reports.map(reportResponse),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updatePatient = async (req, res, next) => {
    try {
      const patientId = req.params.userId;
      const current = await this.userRepository.findById(patientId);
      if (!current || current.role !== 'user') throw new NotFoundError('Patient not found.');
      const allowedFields = ['name', 'age', 'gender', 'city', 'occupation'];
      const body = req.body || {};
      const unknownFields = Object.keys(body).filter((field) => !allowedFields.includes(field));
      if (unknownFields.length) throw new BadRequestError('Only name, age, gender, city, and occupation can be changed here. Contact details require patient verification.');
      if (!Object.keys(body).length) throw new BadRequestError('Provide at least one profile field to update.');
      const update = {};
      for (const field of allowedFields) {
        if (!(field in body)) continue;
        const value = body[field];
        if (field === 'age') {
          if (value !== null && (!Number.isInteger(value) || value < 1 || value > 120)) throw new BadRequestError('age must be a whole number between 1 and 120, or null.');
          update.age = value;
          continue;
        }
        if (value !== null && (typeof value !== 'string' || value.trim().length > 120)) throw new BadRequestError(`${field} must be a text value of at most 120 characters, or null.`);
        const normalized = typeof value === 'string' ? value.trim() : null;
        if (field === 'name' && !normalized) throw new BadRequestError('name cannot be empty.');
        update[field] = normalized || (field === 'name' ? '' : null);
      }
      const updated = await this.userRepository.update(patientId, update);
      return sendSuccess(res, { message: 'Patient profile updated.', data: updated.toPublicProfile() });
    } catch (error) {
      next(error);
    }
  };

  uploadPatientReport = async (req, res, next) => {
    let uploadedAsset;
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      if (!req.file) throw new BadRequestError('Choose a report file to upload.');
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      if (!title || title.length > 160) throw new BadRequestError('Report title is required and must be at most 160 characters.');
      const signatures = {
        'application/pdf': req.file.buffer.subarray(0, 5).toString() === '%PDF-',
        'image/jpeg': req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8 && req.file.buffer[2] === 0xff,
        'image/png': req.file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        'image/webp': req.file.buffer.subarray(0, 4).toString() === 'RIFF' && req.file.buffer.subarray(8, 12).toString() === 'WEBP',
      };
      if (!signatures[req.file.mimetype]) throw new BadRequestError('The report file content does not match its PDF or image type.');
      uploadedAsset = await uploadClinicalReport(req.file, patient.id);
      const report = await this.clinicalReportRepository.create({
        id: uploadedAsset.id,
        userId: patient.id,
        title,
        file_name: String(req.file.originalname || 'report').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180),
        mime_type: req.file.mimetype,
        format: ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[req.file.mimetype],
        bytes: req.file.size,
        public_id: uploadedAsset.public_id,
        uploaded_by: String(req.user?.email || req.user?.login || 'Super Admin'),
      });
      return sendSuccess(res, { message: 'Private patient report uploaded.', data: reportResponse(report), statusCode: 201 });
    } catch (error) {
      if (uploadedAsset?.public_id) {
        try { await deleteClinicalReport(uploadedAsset.public_id); } catch { /* best-effort cleanup after metadata failure */ }
      }
      next(error);
    }
  };

  downloadPatientReport = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const report = await this.clinicalReportRepository.findByUserIdAndId(patient.id, req.params.reportId);
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

  listHairTests = async (req, res, next) => {
    try {
      const result = await this.hairTestRepository.list({
        page: req.query.page,
        limit: req.query.limit,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  listTreatments = async (req, res, next) => {
    try {
      const result = await this.treatmentRepository.list({
        page: req.query.page,
        limit: req.query.limit,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  createTreatment = async (req, res, next) => {
    try {
      const {
        reference_no,
        treatment_name,
        duration = '',
        instructions = '',
        doctor_name = '',
        date,
      } = req.body || {};
      if (typeof reference_no !== 'string' || !reference_no.trim()) {
        throw new BadRequestError('reference_no is required.');
      }
      if (typeof treatment_name !== 'string' || !treatment_name.trim()) {
        throw new BadRequestError('treatment_name is required.');
      }
      if ([duration, instructions, doctor_name].some((value) => typeof value !== 'string')) {
        throw new BadRequestError('duration, instructions, and doctor_name must be strings.');
      }
      const hairTest = await this.hairTestRepository.findByReferenceNo(reference_no.trim());
      if (!hairTest) throw new NotFoundError('Hair test not found for that reference number.');

      const treatment = await this.treatmentRepository.create({
        test_id: hairTest.id,
        reference_no: hairTest.reference_no,
        userId: hairTest.userId,
        treatment_name: treatment_name.trim(),
        duration: duration.trim(),
        instructions: instructions.trim(),
        doctor_name: doctor_name.trim(),
        ...(date ? { date } : {}),
      });
      return sendSuccess(res, {
        message: 'Treatment plan created.',
        data: { ...treatment.toResponse(), reference_no: treatment.reference_no },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  };

  listReviews = async (req, res, next) => {
    try {
      const result = await this.reviewRepository.listAdmin({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  updateReviewStatus = async (req, res, next) => {
    try {
      const { id, status } = req.body || {};
      if (!Number.isInteger(Number(id))) throw new BadRequestError('A numeric review id is required.');
      if (!['pending', 'active', 'rejected'].includes(status)) {
        throw new BadRequestError('status must be pending, active, or rejected.');
      }
      const review = await this.reviewRepository.updateStatus(id, status);
      if (!review) throw new NotFoundError('Review not found.');
      return sendSuccess(res, { message: 'Review status updated.', data: review });
    } catch (error) {
      next(error);
    }
  };
}
