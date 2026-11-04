import { AppError, BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { config } from '../../../config/env.js';
import { uploadClinicalReport, createClinicalReportDownloadUrl, deleteClinicalReport } from '../infrastructure/ClinicalReportStorage.js';
import { progressCheckInResponse } from '../../../shared/utils/progress-checkin-response.js';
import { getEffectivePermissions } from '../../../shared/utils/admin-permissions.js';
import { hashPassword } from '../../../shared/utils/password-hasher.js';

const reportResponse = (report) => ({
  id: report.id,
  userId: report.userId,
  title: report.title,
  file_name: report.file_name,
  mime_type: report.mime_type,
  format: report.format,
  bytes: report.bytes,
  uploaded_by: report.uploaded_by,
  visibility: report.visibility === 'Shared' ? 'Shared' : 'Private',
  shared_at: report.shared_at || null,
  visibility_history: (report.visibility_history || []).map((event) => ({
    action: event.action || (event.visibility === 'Shared' ? 'shared' : 'hidden'),
    visibility: event.visibility === 'Shared' ? 'Shared' : 'Private',
    changed_by: event.changed_by || '',
    changed_at: event.changed_at || null,
    patient_consent_confirmed: event.patient_consent_confirmed === true,
  })),
  deleted_at: report.deleted_at || null,
  purge_after: report.purge_after || null,
  deleted_by: report.deleted_by || '',
  created_at: report.created_at,
});

export class AdminController {
  constructor({
    userRepository,
    hairTestRepository,
    treatmentRepository,
    clinicalReportRepository,
    reviewRepository,
    adminAccountRepository,
    createAdminAccountUseCase,
    imageStorage,
    appointmentRepository,
    patientActivityRepository,
    progressCheckInRepository,
    auditEventRepository,
    featureFlagRepository,
    appReleasePolicyRepository,
    productRepository,
    sessionRepository,
  }) {
    this.userRepository = userRepository;
    this.hairTestRepository = hairTestRepository;
    this.treatmentRepository = treatmentRepository;
    this.clinicalReportRepository = clinicalReportRepository;
    this.reviewRepository = reviewRepository;
    this.adminAccountRepository = adminAccountRepository;
    this.createAdminAccountUseCase = createAdminAccountUseCase;
    this.imageStorage = imageStorage;
    this.appointmentRepository = appointmentRepository;
    this.patientActivityRepository = patientActivityRepository;
    this.progressCheckInRepository = progressCheckInRepository;
    this.auditEventRepository = auditEventRepository;
    this.featureFlagRepository = featureFlagRepository;
    this.appReleasePolicyRepository = appReleasePolicyRepository;
    this.productRepository = productRepository;
    this.sessionRepository = sessionRepository;
  }

  getCurrentAdmin = async (req, res, next) => {
    try {
      const isSuper = req.user?.role === 'super_admin';
      const account = isSuper
        ? { role: 'super_admin', roleTemplate: 'super-admin' }
        : await this.adminAccountRepository.findByLogin(req.user?.email || req.user?.login);

      const effectivePermissions = getEffectivePermissions(account || req.user);
      return sendSuccess(res, {
        data: {
          id: req.user?.id ? String(req.user.id) : null,
          email: req.user?.login || req.user?.email || null,
          name: req.user?.name || null,
          role: req.user?.role || 'admin',
          roleTemplate: account?.roleTemplate || (isSuper ? 'super-admin' : 'clinical-admin'),
          permissions: effectivePermissions,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  listAuditEvents = async (req, res, next) => {
    try {
      if (!this.auditEventRepository) {
        return sendSuccess(res, { data: { items: [] }, meta: { total: 0 } });
      }
      const { page, limit, action, actorId, target } = req.query;
      const result = await this.auditEventRepository.list({ page, limit, action, actorId, target });
      return sendSuccess(res, { data: { items: result.items }, meta: result.meta });
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
      const [reports, archivedReports, appointments, activity, progressCheckIns] = await Promise.all([
        this.clinicalReportRepository.listByUserId(patient.id),
        this.clinicalReportRepository.listArchivedByUserId(patient.id),
        this.appointmentRepository.listByPatient(patient.id),
        this.patientActivityRepository.listByPatient(patient.id),
        this.progressCheckInRepository.listByUserId(patient.id),
      ]);
      const safeAssessments = await Promise.all(assessments.map(async (assessment) => ({
        ...assessment,
        scalp_photos: await Promise.all((assessment.scalp_photos || []).filter((photo) => !photo.deleted_at).map(async (photo) => ({
          ...photo,
          url: photo.delivery_type === 'authenticated'
            ? this.imageStorage.createPrivateDownloadUrl(photo.file_name, photo.format)
            : photo.url,
          url_expires_in_seconds: photo.delivery_type === 'authenticated' ? 300 : null,
        }))),
      })));
      return sendSuccess(res, {
        data: {
          patient: { ...patient.toPublicProfile(), created_at: patient.created_at, updated_at: patient.updated_at },
          assessments: safeAssessments,
          treatments: treatmentsByAssessment.flat().map((treatment) => ({ ...treatment.toResponse(), reference_no: treatment.reference_no })),
          reports: reports.map(reportResponse),
          archived_reports: archivedReports.map(reportResponse),
          appointments,
          activity,
          progress_checkins: await Promise.all(progressCheckIns.map((item) => progressCheckInResponse(item, this.imageStorage))),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getPatientArchive = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const reports = await this.clinicalReportRepository.listArchivedByUserId(patient.id);
      return sendSuccess(res, { data: { reports: reports.map(reportResponse) } });
    } catch (error) { next(error); }
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
      await this.patientActivityRepository?.record({ userId: current.id, patientCode: current.patient_code, type: 'profile', title: 'Patient profile updated', summary: Object.keys(update).join(', '), actor: String(req.user?.email || req.user?.login || 'Super Admin') });
      return sendSuccess(res, { message: 'Patient profile updated.', data: { ...updated.toPublicProfile(), updated_at: updated.updated_at } });
    } catch (error) {
      next(error);
    }
  };

  setUserStatus = async (req, res, next) => {
    try {
      const patientId = req.params.userId;
      const current = await this.userRepository.findById(patientId);
      if (!current || current.role !== 'user') throw new NotFoundError('Patient not found.');

      const { is_blocked, status, reason } = req.body || {};
      const shouldBlock = is_blocked !== undefined ? Boolean(is_blocked) : status === 'blocked';
      const newStatus = status || (shouldBlock ? 'blocked' : 'active');

      const updated = await this.userRepository.setStatus(patientId, {
        is_blocked: shouldBlock,
        status: newStatus,
        blocked_reason: reason || (shouldBlock ? 'Administrative suspension' : null),
      });

      if (shouldBlock && this.sessionRepository?.revokeAllForUser) {
        await this.sessionRepository.revokeAllForUser(current.id, 'ACCOUNT_BLOCKED');
      }

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor: String(req.user?.name || req.user?.email || 'Super Admin'),
          action: shouldBlock ? 'user.blocked' : 'user.unblocked',
          target: current.patient_code || `patient_${current.id}`,
          targetType: 'User',
          details: {
            patientId: current.id,
            name: current.name,
            phone: current.phone,
            is_blocked: shouldBlock,
            status: newStatus,
            reason: reason || null,
          },
        });
      }

      return sendSuccess(res, {
        message: shouldBlock ? 'Patient account has been blocked.' : 'Patient account has been unblocked.',
        data: updated ? updated.toPublicProfile() : null,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req, res, next) => {
    try {
      const patientId = req.params.userId;
      const current = await this.userRepository.findById(patientId);
      if (!current || current.role !== 'user') throw new NotFoundError('Patient not found.');

      const deleted = await this.userRepository.deleteAccount(patientId);
      if (!deleted) throw new NotFoundError('Patient account could not be found or was already deleted.');

      if (this.sessionRepository?.revokeAllForUser) {
        await this.sessionRepository.revokeAllForUser(current.id, 'ACCOUNT_DELETED');
      }

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor: String(req.user?.name || req.user?.email || 'Super Admin'),
          action: 'user.deleted',
          target: current.patient_code || `patient_${current.id}`,
          targetType: 'User',
          details: {
            patientId: current.id,
            name: current.name,
            phone: current.phone,
          },
        });
      }

      return sendSuccess(res, {
        message: 'Patient account has been permanently deleted.',
        data: { id: current.id, patient_code: current.patient_code },
      });
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
      const uploadedBy = String(req.user?.email || req.user?.login || 'Super Admin');
      const report = await this.clinicalReportRepository.create({
        id: uploadedAsset.id,
        userId: patient.id,
        title,
        file_name: String(req.file.originalname || 'report').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180),
        mime_type: req.file.mimetype,
        format: ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[req.file.mimetype],
        bytes: req.file.size,
        public_id: uploadedAsset.public_id,
        uploaded_by: uploadedBy,
        visibility: 'Private',
        shared_at: null,
        visibility_history: [{ action: 'uploaded', visibility: 'Private', changed_by: uploadedBy, changed_at: new Date() }],
      });
      await this.patientActivityRepository.record({ userId: patient.id, patientCode: patient.patient_code, type: 'report', title: 'Report uploaded', summary: title, actor: uploadedBy, metadata: { report_id: report.id } });
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor: uploadedBy,
          action: 'report.uploaded',
          target: `patient:${patient.id}`,
          metadata: { report_id: report.id, title },
        }).catch(() => null);
      }
      return sendSuccess(res, { message: 'Private patient report uploaded.', data: reportResponse(report), statusCode: 201 });
    } catch (error) {
      if (uploadedAsset?.public_id) {
        try { await deleteClinicalReport(uploadedAsset.public_id); } catch { /* best-effort cleanup after metadata failure */ }
      }
      next(error);
    }
  };

  updatePatientReportVisibility = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const visibility = req.body?.visibility;
      if (!['Private', 'Shared'].includes(visibility)) throw new BadRequestError('visibility must be either Private or Shared.');
      if (visibility === 'Shared' && req.body?.patient_consent_confirmed !== true) throw new BadRequestError('Confirm that the patient agreed to view this report before sharing it.');
      const changedBy = String(req.user?.email || req.user?.login || 'Super Admin');
      const report = await this.clinicalReportRepository.updateVisibility(patient.id, req.params.reportId, visibility, changedBy, visibility === 'Shared');
      if (!report) throw new NotFoundError('Patient report not found.');
      await this.patientActivityRepository.record({ userId: patient.id, patientCode: patient.patient_code, type: 'report', title: visibility === 'Shared' ? 'Report shared with patient' : 'Report hidden from patient', summary: report.title, actor: changedBy, metadata: { report_id: report.id, patient_consent_confirmed: visibility === 'Shared' } });
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor: changedBy,
          action: visibility === 'Shared' ? 'report.shared' : 'report.hidden',
          target: `patient:${patient.id}`,
          metadata: { report_id: report.id, visibility, patient_consent_confirmed: visibility === 'Shared' },
        }).catch(() => null);
      }
      return sendSuccess(res, {
        message: visibility === 'Shared' ? 'Report is now visible to the patient.' : 'Report is now hidden from the patient.',
        data: reportResponse(report),
      });
    } catch (error) {
      next(error);
    }
  };

  deletePatientReport = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const report = await this.clinicalReportRepository.findByUserIdAndId(patient.id, req.params.reportId);
      if (!report) throw new NotFoundError('Patient report not found.');

      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      const archived = await this.clinicalReportRepository.archiveByUserIdAndId(patient.id, report.id, actor);
      if (!archived) throw new NotFoundError('Patient report was already archived. Refresh the patient record.');
      await this.patientActivityRepository.record({ userId: patient.id, patientCode: patient.patient_code, type: 'report', title: 'Report archived for 30 days', summary: report.title, actor, metadata: { report_id: report.id, purge_after: archived.purge_after } });
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'report.archived',
          target: `patient:${patient.id}`,
          metadata: { report_id: report.id, title: report.title, purge_after: archived.purge_after },
        }).catch(() => null);
      }

      return sendSuccess(res, {
        message: 'Report moved to the recovery archive for 30 days.',
        data: reportResponse(archived),
      });
    } catch (error) {
      next(error);
    }
  };

  deletePatientScalpPhoto = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const assessmentId = Number(req.params.assessmentId);
      const photoIndex = Number(req.params.photoIndex);
      if (!Number.isSafeInteger(assessmentId) || assessmentId < 1 || !Number.isInteger(photoIndex) || photoIndex < 0) {
        throw new BadRequestError('A valid assessment and photo index are required.');
      }
      const assessment = await this.hairTestRepository.findByIdAndUserId(assessmentId, patient.id);
      const photo = assessment?.scalp_photos?.[photoIndex];
      if (!photo || typeof photo.url !== 'string' || typeof photo.file_name !== 'string') throw new NotFoundError('Scalp photo not found.');

      const allowedFolders = [
        `${config.cloudinary.imageFolder}/user-${patient.id}/assessment/`,
        `${config.cloudinary.imageFolder}/scalp/`,
      ];
      if (!allowedFolders.some((folder) => photo.file_name.startsWith(folder)) || photo.file_name.includes('..')) {
        throw new BadRequestError('This scalp photo is not stored in an approved patient-upload folder.');
      }

      const removed = await this.hairTestRepository.removeScalpPhoto(patient.id, assessmentId, photoIndex, photo.url);
      if (!removed) throw new NotFoundError('Scalp photo was already removed. Refresh the patient record.');
      try {
        await this.imageStorage.deleteImage(photo.file_name, { deliveryType: photo.delivery_type || 'upload' });
      } catch {
        await this.hairTestRepository.restoreScalpPhoto(patient.id, assessmentId, photoIndex, removed);
        throw new AppError('The photo could not be deleted from storage. The assessment reference was restored; retry later.', 503);
      }
      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      await this.patientActivityRepository.record({ userId: patient.id, patientCode: patient.patient_code, type: 'assessment', title: 'Scalp photo permanently deleted', summary: assessment.reference_no || `Assessment ${assessmentId}`, actor, metadata: { assessment_id: assessmentId, file_name: photo.file_name } });
      return sendSuccess(res, {
        message: 'Scalp photo and database reference permanently deleted.',
        data: { assessment_id: assessmentId, file_name: photo.file_name },
      });
    } catch (error) {
      next(error);
    }
  };

  restorePatientReport = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const report = await this.clinicalReportRepository.restoreByUserIdAndId(patient.id, req.params.reportId);
      if (!report) throw new NotFoundError('Archived report was not found or its 30-day recovery window has ended.');
      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      await this.patientActivityRepository.record({ userId: patient.id, patientCode: patient.patient_code, type: 'report', title: 'Archived report restored', summary: report.title, actor, metadata: { report_id: report.id } });
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'report.restored',
          target: `patient:${patient.id}`,
          metadata: { report_id: report.id, title: report.title },
        }).catch(() => null);
      }
      return sendSuccess(res, { message: 'Report restored to the patient record as private.', data: reportResponse(report) });
    } catch (error) { next(error); }
  };

  downloadPatientReport = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const report = await this.clinicalReportRepository.findByUserIdAndId(patient.id, req.params.reportId);
      if (!report) throw new NotFoundError('Patient report not found.');
      const inline = req.query?.inline === 'true';
      return sendSuccess(res, {
        data: {
          url: createClinicalReportDownloadUrl(report.public_id, report.format, { attachment: !inline }),
          expires_in_seconds: 60,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  reviewProgressCheckIn = async (req, res, next) => {
    try {
      const patient = await this.userRepository.findById(req.params.userId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const checkInId = req.params.checkInId;
      const { doctor_note, is_doctor_reviewed = true } = req.body || {};
      if (doctor_note !== undefined && (typeof doctor_note !== 'string' || doctor_note.length > 2000)) {
        throw new BadRequestError('doctor_note must be text with at most 2000 characters.');
      }
      const existing = await this.progressCheckInRepository.findById(patient.id, checkInId);
      if (!existing) throw new NotFoundError('Progress check-in not found.');
      const updated = await this.progressCheckInRepository.updateReview(patient.id, checkInId, {
        doctor_note,
        is_doctor_reviewed,
      });
      const actor = String(req.user?.email || req.user?.login || 'Clinician');
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'progress_checkin.reviewed',
          target: `patient:${patient.id}`,
          metadata: { checkin_id: checkInId, is_doctor_reviewed: Boolean(is_doctor_reviewed), doctor_note: (doctor_note || '').slice(0, 100) },
        }).catch(() => null);
      }
      await this.patientActivityRepository?.record({
        userId: patient.id,
        patientCode: patient.patient_code,
        type: 'care_plan',
        title: 'Daily progress reviewed',
        summary: doctor_note ? doctor_note.slice(0, 120) : 'Progress check-in reviewed by clinician',
        actor,
        metadata: { checkin_id: checkInId },
      }).catch(() => null);

      return sendSuccess(res, {
        message: 'Progress check-in reviewed.',
        data: { item: await progressCheckInResponse(updated, this.imageStorage) },
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
      const items = await Promise.all(result.items.map(async (assessment) => ({
        ...assessment,
        scalp_photos: await Promise.all((assessment.scalp_photos || []).filter((photo) => !photo.deleted_at).map(async (photo) => ({
          ...photo,
          url: photo.delivery_type === 'authenticated'
            ? this.imageStorage.createPrivateDownloadUrl(photo.file_name, photo.format)
            : photo.url,
          url_expires_in_seconds: photo.delivery_type === 'authenticated' ? 300 : null,
        }))),
      })));
      return sendSuccess(res, { data: { ...result, items } });
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
        medications = [],
        diagnosis = '',
        stage = '',
        next_review_date = '',
        routine_steps = [],
        diet_meals = [],
        date,
      } = req.body || {};
      if (typeof reference_no !== 'string' || !reference_no.trim()) {
        throw new BadRequestError('reference_no is required.');
      }
      if (typeof treatment_name !== 'string' || !treatment_name.trim()) {
        throw new BadRequestError('treatment_name is required.');
      }
      if ([duration, instructions, doctor_name, diagnosis, stage, next_review_date].some((value) => typeof value !== 'string')) {
        throw new BadRequestError('Treatment plan text fields must be strings.');
      }
      if (diagnosis.length > 500 || stage.length > 120 || next_review_date.length > 10) throw new BadRequestError('Diagnosis, stage, or review date exceeds its allowed length.');
      if (next_review_date && !/^\d{4}-\d{2}-\d{2}$/.test(next_review_date)) throw new BadRequestError('next_review_date must use YYYY-MM-DD format.');
      if (!Array.isArray(medications) || medications.length > 25) {
        throw new BadRequestError('medications must be a list of up to 25 selected medicines or care products.');
      }
      const normalizedMedications = medications.map((medicine) => {
        if (!medicine || typeof medicine !== 'object' || Array.isArray(medicine)) {
          throw new BadRequestError('Each prescribed medicine must be an object.');
        }
        const fields = ['catalog_id', 'name', 'category', 'form', 'dose', 'frequency', 'duration', 'instructions'];
        for (const field of fields) {
          const value = medicine[field];
          if (value !== undefined && (typeof value !== 'string' || value.length > (field === 'instructions' ? 1000 : 240))) {
            throw new BadRequestError(`Medication ${field} must be text with a valid length.`);
          }
        }
        if (!medicine.name?.trim() || !medicine.dose?.trim() || !medicine.frequency?.trim()) {
          throw new BadRequestError('Each prescribed medicine needs a name, dose, and frequency.');
        }
        return Object.fromEntries(fields.map((field) => [field, typeof medicine[field] === 'string' ? medicine[field].trim() : '']));
      });
      if (!Array.isArray(routine_steps) || routine_steps.length > 30) throw new BadRequestError('routine_steps must contain up to 30 care steps.');
      const normalizedRoutineSteps = routine_steps.map((step) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) throw new BadRequestError('Each routine step must be an object.');
        const fields = { title: 160, subtitle: 500, category: 80, time_of_day: 80 };
        for (const [field, maxLength] of Object.entries(fields)) {
          const value = step[field];
          if (value !== undefined && (typeof value !== 'string' || value.length > maxLength)) throw new BadRequestError(`Routine step ${field} must be text of at most ${maxLength} characters.`);
        }
        if (!step.title?.trim()) throw new BadRequestError('Each routine step needs a title.');
        return Object.fromEntries(Object.keys(fields).map((field) => [field, typeof step[field] === 'string' ? step[field].trim() : '']));
      });
      if (!Array.isArray(diet_meals) || diet_meals.length > 20) throw new BadRequestError('diet_meals must contain up to 20 meal suggestions.');
      const normalizedDietMeals = diet_meals.map((meal) => {
        if (!meal || typeof meal !== 'object' || Array.isArray(meal)) throw new BadRequestError('Each diet meal must be an object.');
        const fields = { type: 60, name: 160, nutrients: 200, benefit: 500 };
        for (const [field, maxLength] of Object.entries(fields)) {
          const value = meal[field];
          if (value !== undefined && (typeof value !== 'string' || value.length > maxLength)) throw new BadRequestError(`Diet meal ${field} must be text of at most ${maxLength} characters.`);
        }
        if (!meal.type?.trim() || !meal.name?.trim()) throw new BadRequestError('Each diet meal needs a meal type and name.');
        return Object.fromEntries(Object.keys(fields).map((field) => [field, typeof meal[field] === 'string' ? meal[field].trim() : '']));
      });
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
        medications: normalizedMedications,
        diagnosis: diagnosis.trim(),
        stage: stage.trim(),
        next_review_date: next_review_date.trim(),
        routine_steps: normalizedRoutineSteps,
        diet_meals: normalizedDietMeals,
        ...(date ? { date } : {}),
      });
      if (this.hairTestRepository?.updateStatus) {
        await this.hairTestRepository.updateStatus(hairTest.reference_no, 'reviewed', {
          changed_by: String(req.user?.email || req.user?.login || 'Super Admin'),
          note: `Care plan assigned: ${treatment_name.trim()}`,
        }).catch(() => null);
      }
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor: String(req.user?.email || req.user?.login || 'Super Admin'),
          action: 'care_plan.created',
          target: `patient:${hairTest.userId}`,
          metadata: { reference_no: hairTest.reference_no, treatment_name: treatment_name.trim() },
        }).catch(() => null);
      }
      await this.patientActivityRepository?.record({ userId: hairTest.userId, type: 'care_plan', title: 'Care plan added', summary: treatment_name.trim(), actor: String(req.user?.email || req.user?.login || 'Super Admin'), metadata: { reference_no: hairTest.reference_no } });
      return sendSuccess(res, {
        message: 'Treatment plan created.',
        data: { ...treatment.toResponse(), reference_no: treatment.reference_no },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  };

  updatePatientDietPlan = async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { diet_meals } = req.body || {};
      if (!Array.isArray(diet_meals) || diet_meals.length > 20) {
        throw new BadRequestError('diet_meals must contain up to 20 meal suggestions.');
      }
      const normalizedDietMeals = diet_meals.map((meal) => {
        if (!meal || typeof meal !== 'object' || Array.isArray(meal)) {
          throw new BadRequestError('Each diet meal must be an object.');
        }
        const fields = { type: 60, name: 160, nutrients: 200, benefit: 500 };
        for (const [field, maxLength] of Object.entries(fields)) {
          const value = meal[field];
          if (value !== undefined && (typeof value !== 'string' || value.length > maxLength)) {
            throw new BadRequestError(`Diet meal ${field} must be text of at most ${maxLength} characters.`);
          }
        }
        if (!meal.type?.trim() || !meal.name?.trim()) {
          throw new BadRequestError('Each diet meal needs a meal type and name.');
        }
        return Object.fromEntries(Object.keys(fields).map((field) => [field, typeof meal[field] === 'string' ? meal[field].trim() : '']));
      });

      const updated = await this.treatmentRepository.updateDietMeals(userId, normalizedDietMeals);
      const actor = String(req.user?.email || req.user?.login || 'Admin');
      await this.auditEventRepository?.record({
        actor,
        action: 'care_plan.diet_updated',
        target: `patient:${userId}`,
        metadata: { meal_count: normalizedDietMeals.length },
      }).catch(() => null);

      return sendSuccess(res, {
        message: 'Patient diet plan updated successfully.',
        data: { diet_meals: updated?.diet_meals || [] },
      });
    } catch (err) {
      next(err);
    }
  };

  updateHairTestStatus = async (req, res, next) => {
    try {
      const { referenceNo } = req.params;
      const { status, note } = req.body || {};
      if (!status || typeof status !== 'string') throw new BadRequestError('status is required.');
      const actor = String(req.user?.email || req.user?.login || 'Admin');
      const updated = await this.hairTestRepository.updateStatus(referenceNo, status.trim(), {
        changed_by: actor,
        note: typeof note === 'string' ? note.trim() : '',
      });
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'assessment.status_updated',
          target: `assessment:${referenceNo}`,
          metadata: { status: updated.status, reference_no: referenceNo },
        }).catch(() => null);
      }
      return sendSuccess(res, { message: 'Assessment status updated.', data: updated });
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

  getDashboardSummary = async (req, res, next) => {
    try {
      let totalPatients = 0;
      if (this.userRepository?.count) {
        totalPatients = await this.userRepository.count();
      } else if (this.userRepository?.list) {
        const u = await this.userRepository.list({ limit: 1 });
        totalPatients = u?.total || 0;
      }

      let totalAppointments = 0;
      let todayAppointments = 0;
      let pendingAppointments = 0;
      let confirmedAppointments = 0;
      let completedAppointments = 0;
      if (this.appointmentRepository?.list) {
        const appts = await this.appointmentRepository.list({ limit: 500 });
        const items = Array.isArray(appts) ? appts : (appts?.items || []);
        totalAppointments = Array.isArray(appts) ? appts.length : (appts?.total || items.length);
        const todayStr = new Date().toISOString().slice(0, 10);
        todayAppointments = items.filter(
          (a) => (a.starts_at || '').slice(0, 10) === todayStr && !['Cancelled', 'No show'].includes(a.status),
        ).length;
        pendingAppointments = items.filter((a) => a.status === 'Pending').length;
        confirmedAppointments = items.filter((a) => a.status === 'Confirmed').length;
        completedAppointments = items.filter((a) => a.status === 'Completed').length;
      }

      let totalAssessments = 0;
      let pendingAssessments = 0;
      if (this.hairTestRepository?.listAdmin) {
        const tests = await this.hairTestRepository.listAdmin({ limit: 500 });
        const items = Array.isArray(tests) ? tests : (tests?.items || []);
        totalAssessments = Array.isArray(tests) ? tests.length : (tests?.total || items.length);
        pendingAssessments = items.filter((t) => t.status === 'Submitted' || t.status === 'Review' || !t.reviewed).length;
      }

      let totalReports = 0;
      let sharedReports = 0;
      if (this.clinicalReportRepository?.listAll) {
        const reps = await this.clinicalReportRepository.listAll();
        totalReports = reps.length;
        sharedReports = reps.filter((r) => r.visibility === 'Shared').length;
      }

      let totalProducts = 0;
      let lowStockProducts = 0;
      if (this.productRepository?.list) {
        const prods = await this.productRepository.list({ limit: 100 });
        const items = prods?.items || [];
        totalProducts = prods?.total || items.length;
        lowStockProducts = items.filter((p) => (p.stock || p.inventory_count || 0) < 10).length;
      }

      let recentActivity = [];
      if (this.auditEventRepository?.list) {
        const logs = await this.auditEventRepository.list({ limit: 10 });
        recentActivity = (logs?.items || []).map((e) => ({
          id: e.id,
          who: e.actor,
          action: e.action,
          target: e.target,
          type: e.targetType || 'System',
          time: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
        }));
      }

      return sendSuccess(res, {
        data: {
          patients: { total: totalPatients },
          appointments: {
            total: totalAppointments,
            today: todayAppointments,
            pending: pendingAppointments,
            confirmed: confirmedAppointments,
            completed: completedAppointments,
          },
          assessments: {
            total: totalAssessments,
            pending: pendingAssessments,
          },
          reports: {
            total: totalReports,
            shared: sharedReports,
          },
          catalog: {
            totalProducts,
            lowStockProducts,
          },
          recentActivity,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  inviteAdmin = async (req, res, next) => {
    try {
      const actor = req.user?.email || 'Super Admin';
      const { name, email, roleTemplate, permissions, permissionOverrides } = req.body || {};
      const { account, generatedPassword } = await this.createAdminAccountUseCase.execute({
        name,
        email,
        roleTemplate,
        permissions,
        permissionOverrides,
      });

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'admin.invited',
          target: `admin:${account.email}`,
          metadata: { id: account.id, email: account.email, roleTemplate },
        }).catch(() => null);
      }

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Admin account invited successfully.',
        data: {
          admin: account,
          credentials: {
            login_id: account.email,
            password: generatedPassword,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateAdminAccess = async (req, res, next) => {
    try {
      const { id } = req.params;
      const actor = req.user?.email || 'Super Admin';
      const { roleTemplate, permissions, permissionOverrides } = req.body || {};
      const updated = await this.adminAccountRepository.updateAccess(id, {
        roleTemplate,
        permissions,
        permissionOverrides,
      });

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'admin.access_updated',
          target: `admin:${updated.email}`,
          metadata: { id, roleTemplate, permissionsCount: updated.effectivePermissions?.length },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Admin access updated successfully.', data: updated });
    } catch (error) {
      next(error);
    }
  };

  setAdminStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const actor = req.user?.email || 'Super Admin';
      let { active, status } = req.body || {};

      if (typeof active !== 'boolean') {
        if (typeof status === 'string') {
          active = status.toLowerCase() === 'active';
        } else {
          throw new BadRequestError('active boolean flag or status ("active" | "suspended") is required.');
        }
      }

      const updated = active
        ? await this.adminAccountRepository.reactivate(id)
        : await this.adminAccountRepository.suspend(id);

      if (!active && this.sessionRepository?.revokeByUserId) {
        await this.sessionRepository.revokeByUserId(id, 'ACCOUNT_SUSPENDED').catch(() => null);
      }

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: active ? 'admin.reactivated' : 'admin.suspended',
          target: `admin:${updated.email}`,
          metadata: { id, active },
        }).catch(() => null);
      }

      return sendSuccess(res, {
        message: active ? 'Admin account reactivated.' : 'Admin account suspended.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  rotateAdminPassword = async (req, res, next) => {
    try {
      const { id } = req.params;
      const actor = req.user?.email || 'Super Admin';
      const { newPassword } = req.body || {};

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new BadRequestError('newPassword must be at least 8 characters long.');
      }

      const passwordHash = await hashPassword(newPassword);
      await this.adminAccountRepository.rotatePassword(id, passwordHash);

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'admin.password_rotated',
          target: `admin:${id}`,
          metadata: { id },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Password rotated successfully.' });
    } catch (error) {
      next(error);
    }
  };

  listFeatureFlags = async (req, res, next) => {
    try {
      if (!this.featureFlagRepository) throw new NotFoundError('Feature flag management is not configured.');
      const flags = await this.featureFlagRepository.list({
        platform: req.query?.platform,
        enabled: req.query?.enabled !== undefined ? req.query.enabled === 'true' : undefined,
      });
      return sendSuccess(res, { data: { items: flags, total: flags.length } });
    } catch (error) {
      next(error);
    }
  };

  updateFeatureFlag = async (req, res, next) => {
    try {
      const { key } = req.params;
      const actor = req.user?.email || 'Super Admin';
      if (!this.featureFlagRepository) throw new NotFoundError('Feature flag management is not configured.');
      const { enabled, rolloutPercentage, effectiveDate, platform, description, title, group } = req.body || {};

      const updated = await this.featureFlagRepository.setFlag(key, {
        enabled,
        rolloutPercentage,
        effectiveDate,
        platform,
        description,
        title,
        group,
        updatedBy: actor,
      });

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'feature_flag.updated',
          target: `flag:${key}`,
          metadata: { key, enabled: updated.enabled, rolloutPercentage: updated.rolloutPercentage },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Feature flag updated successfully.', data: updated });
    } catch (error) {
      next(error);
    }
  };

  listReleasePolicies = async (req, res, next) => {
    try {
      if (!this.appReleasePolicyRepository) throw new NotFoundError('Release policy management is not configured.');
      const policies = await this.appReleasePolicyRepository.list();
      return sendSuccess(res, { data: { items: policies } });
    } catch (error) {
      next(error);
    }
  };

  updateReleasePolicy = async (req, res, next) => {
    try {
      const { platform } = req.params;
      const actor = req.user?.email || 'Super Admin';
      if (!this.appReleasePolicyRepository) throw new NotFoundError('Release policy management is not configured.');
      const { minVersion, latestVersion, forceUpdate, maintenanceMode, maintenanceMessage, releaseNotes, downloadUrl } = req.body || {};

      const updated = await this.appReleasePolicyRepository.setPolicy(platform, {
        minVersion,
        latestVersion,
        forceUpdate,
        maintenanceMode,
        maintenanceMessage,
        releaseNotes,
        downloadUrl,
        updatedBy: actor,
      });

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'release_policy.updated',
          target: `policy:${platform}`,
          metadata: { platform, minVersion, latestVersion, forceUpdate, maintenanceMode },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Release policy updated successfully.', data: updated });
    } catch (error) {
      next(error);
    }
  };

  getAppConfig = async (req, res, next) => {
    try {
      const platform = String(req.headers?.['x-platform'] || req.query?.platform || 'android').toLowerCase();
      const clientVersion = String(req.headers?.['x-app-version'] || req.query?.version || '1.0.0');

      let versionCheck = { updateRequired: false, updateAvailable: false, maintenanceMode: false };
      if (this.appReleasePolicyRepository) {
        versionCheck = await this.appReleasePolicyRepository.checkClientVersion({ platform, clientVersion });
      }

      let flags = {};
      if (this.featureFlagRepository) {
        const flagList = await this.featureFlagRepository.list({ platform });
        flags = Object.fromEntries(flagList.map((f) => [f.key, f.enabled]));
      }

      return sendSuccess(res, {
        data: {
          platform,
          version: clientVersion,
          versionCheck,
          features: flags,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  listAuditLogs = async (req, res, next) => {
    try {
      const { page, limit, action, actorId, target, query, startDate, endDate } = req.query || {};
      const result = await this.auditEventRepository.list({
        page,
        limit,
        action,
        actorId,
        target,
        query,
        startDate,
        endDate,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  exportAuditLogs = async (req, res, next) => {
    try {
      const actor = req.user?.email || 'Super Admin';
      const { action, actorId, target, query, startDate, endDate, format = 'json' } = req.query || {};

      const exported = await this.auditEventRepository.exportLogs({
        action,
        actorId,
        target,
        query,
        startDate,
        endDate,
        format,
      });

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'audit.exported',
          target: 'audit_logs',
          metadata: { count: exported.count, format },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Audit logs exported successfully.', data: exported });
    } catch (error) {
      next(error);
    }
  };

  exportPatients = async (req, res, next) => {
    try {
      const actor = req.user?.email || 'Super Admin';
      const users = await this.userRepository.list({ limit: 1000 });
      const items = (users?.items || []).map((u) => ({
        id: u.id,
        patientCode: u.patient_code,
        name: u.name,
        email: u.email,
        phone: u.phone,
        age: u.age,
        gender: u.gender,
        city: u.city,
        occupation: u.occupation,
        created_at: u.created_at,
      }));

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'patients.exported',
          target: 'patients',
          metadata: { count: items.length },
        }).catch(() => null);
      }

      return sendSuccess(res, {
        message: 'Patients exported successfully.',
        data: { count: items.length, items, exportedAt: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  };

  exportAppointments = async (req, res, next) => {
    try {
      const actor = req.user?.email || 'Super Admin';
      const appts = await this.appointmentRepository.list({ limit: 1000 });
      const rawList = Array.isArray(appts) ? appts : (appts?.items || []);
      const items = rawList.map((a) => ({
        id: a.id,
        patientId: a.patient_id,
        patientName: a.patient_name,
        doctorName: a.doctor_name,
        startsAt: a.starts_at,
        timeSlot: a.time_slot,
        serviceName: a.service_name,
        status: a.status,
        paymentStatus: a.payment_status,
        consultationFee: a.consultation_fee,
        created_at: a.created_at,
      }));

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'appointments.exported',
          target: 'appointments',
          metadata: { count: items.length },
        }).catch(() => null);
      }

      return sendSuccess(res, {
        message: 'Appointments exported successfully.',
        data: { count: items.length, items, exportedAt: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  };
}
