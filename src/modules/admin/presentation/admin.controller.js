import { AppError, BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { config } from '../../../config/env.js';
import { uploadClinicalReport, createClinicalReportDownloadUrl, deleteClinicalReport } from '../infrastructure/ClinicalReportStorage.js';
import { progressCheckInResponse } from '../../../shared/utils/progress-checkin-response.js';

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
  constructor({ userRepository, hairTestRepository, treatmentRepository, clinicalReportRepository, reviewRepository, adminAccountRepository, createAdminAccountUseCase, imageStorage, appointmentRepository, patientActivityRepository, progressCheckInRepository }) {
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
