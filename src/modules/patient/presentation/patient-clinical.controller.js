import { AppError, BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { createClinicalReportDownloadUrl } from '../../admin/infrastructure/ClinicalReportStorage.js';
import { config } from '../../../config/env.js';
import { progressCheckInResponse } from '../../../shared/utils/progress-checkin-response.js';

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
  constructor({ hairTestRepository, treatmentRepository, clinicalReportRepository, appointmentRepository, progressCheckInRepository, patientActivityRepository, imageStorage, submitHairTestUseCase }) {
    this.hairTestRepository = hairTestRepository;
    this.treatmentRepository = treatmentRepository;
    this.clinicalReportRepository = clinicalReportRepository;
    this.appointmentRepository = appointmentRepository;
    this.progressCheckInRepository = progressCheckInRepository;
    this.patientActivityRepository = patientActivityRepository;
    this.imageStorage = imageStorage;
    this.submitHairTestUseCase = submitHairTestUseCase;
  }

  getClinicalRecord = async (req, res, next) => {
    try {
      const userId = req.user.id;
      const [assessments, carePlans, reports, appointments] = await Promise.all([
        this.hairTestRepository?.findByUserId ? this.hairTestRepository.findByUserId(userId) : [],
        this.treatmentRepository?.findByUserId ? this.treatmentRepository.findByUserId(userId) : [],
        this.clinicalReportRepository?.listSharedByUserId
          ? this.clinicalReportRepository.listSharedByUserId(userId)
          : this.clinicalReportRepository?.listByUserId
            ? this.clinicalReportRepository.listByUserId(userId)
            : [],
        this.appointmentRepository?.listByPatient ? this.appointmentRepository.listByPatient(userId) : [],
      ]);
      return sendSuccess(res, {
        data: {
          assessments: await Promise.all(
            assessments
              .filter((assessment) => assessment.status !== 'draft')
              .map(async (assessment) => ({
                ...assessment,
                status: assessment.status || 'submitted',
                status_history: assessment.status_history || [],
                scalp_photos: await Promise.all((assessment.scalp_photos || []).filter((photo) => !photo.deleted_at).map(async (photo) => ({
                  ...photo,
                  url: photo.delivery_type === 'authenticated'
                    ? this.imageStorage.createPrivateDownloadUrl(photo.file_name, photo.format)
                    : photo.url,
                  url_expires_in_seconds: photo.delivery_type === 'authenticated' ? 300 : null,
                }))),
              }))
          ),
          care_plans: carePlans.map((plan) => ({ ...plan.toResponse(), reference_no: plan.reference_no })),
          reports: reports.map(publicReport),
          appointments,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getAssessmentDraft = async (req, res, next) => {
    try {
      const draft = await this.hairTestRepository.getDraft(req.user.id);
      return sendSuccess(res, { data: { draft } });
    } catch (error) {
      next(error);
    }
  };

  saveAssessmentDraft = async (req, res, next) => {
    try {
      const body = req.body || {};
      const formData = body.formData || body;
      const step = typeof body.step === 'number' ? body.step : 0;
      const draft = await this.hairTestRepository.saveDraft(req.user.id, formData, step);
      return sendSuccess(res, { message: 'Assessment draft saved.', data: { draft } });
    } catch (error) {
      next(error);
    }
  };

  deleteAssessmentDraft = async (req, res, next) => {
    try {
      await this.hairTestRepository.deleteDraft(req.user.id);
      return sendSuccess(res, { message: 'Assessment draft deleted.' });
    } catch (error) {
      next(error);
    }
  };

  submitAssessment = async (req, res, next) => {
    try {
      const userId = req.user.id;
      let formData = req.body || {};
      if ((!formData || Object.keys(formData).length === 0 || formData.use_draft) && this.hairTestRepository?.getDraft) {
        const draft = await this.hairTestRepository.getDraft(userId);
        if (draft?.formData) {
          formData = { ...draft.formData, ...formData };
        }
      }
      if (!this.submitHairTestUseCase) {
        throw new AppError('Assessment submission is currently unavailable.', 503);
      }
      const result = await this.submitHairTestUseCase.execute({
        userId,
        formData,
        files: req.files || {},
      });
      if (this.patientActivityRepository?.record) {
        await this.patientActivityRepository.record({
          userId,
          type: 'assessment',
          title: 'Hair assessment submitted',
          summary: result.reference_no,
          actor: 'Patient app',
          metadata: { reference_no: result.reference_no },
        }).catch(() => null);
      }
      return sendSuccess(res, {
        message: result.message,
        statusCode: 201,
        data: {
          reference_no: result.reference_no,
          test: result.test,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  listProgressCheckIns = async (req, res, next) => {
    try {
      const items = await this.progressCheckInRepository.listByUserId(req.user.id);
      return sendSuccess(res, { data: { items: await Promise.all(items.map((item) => progressCheckInResponse(item, this.imageStorage))) } });
    } catch (error) { next(error); }
  };

  createProgressCheckIn = async (req, res, next) => {
    let cleanPhotos = [];
    let persisted = false;
    try {
      const userId = Number(req.user.id);
      const body = req.body || {};
      const id = String(body.id || '').trim();
      const date = new Date(body.date);
      const photos = body.photos;
      const allowedAngles = new Set(['front', 'top', 'back']);
      if (!/^[a-zA-Z0-9_-]{5,80}$/.test(id)) throw new BadRequestError('A valid progress check-in ID is required.');
      if (!body.date || Number.isNaN(date.getTime())) throw new BadRequestError('A valid check-in date is required.');
      if (!Array.isArray(photos) || photos.length < 1 || photos.length > 3) throw new BadRequestError('Attach one to three progress photos uploaded through the media API.');
      const seenAngles = new Set();
      const ownedPrefix = `${String(config.cloudinary.imageFolder || 'drhair/images').replace(/^\/+|\/+$/g, '')}/user-${userId}/progress/`;
      for (const photo of photos) {
        const angle = String(photo?.angle || '').toLowerCase();
        const publicId = String(photo?.public_id || '').trim();
        if (!allowedAngles.has(angle) || seenAngles.has(angle)) throw new BadRequestError('Each photo needs one unique front, top, or back angle.');
        if (!publicId.startsWith(ownedPrefix) || publicId.includes('..')) {
          throw new BadRequestError('Progress photos must be uploaded to this patient’s progress media folder.');
        }
        let asset;
        try { asset = await this.imageStorage.getAuthenticatedImage(publicId); }
        catch { throw new BadRequestError('Progress photos must reference private images uploaded to this patient’s progress media folder.'); }
        if (asset.type !== 'authenticated' || asset.public_id !== publicId || !Number.isFinite(asset.bytes) || asset.bytes <= 0) {
          throw new BadRequestError('Progress photos must reference private images uploaded to this patient’s progress media folder.');
        }
        seenAngles.add(angle);
        cleanPhotos.push({
          angle,
          public_id: publicId,
          url: asset.secure_url,
          delivery_type: 'authenticated',
          format: asset.format,
          file_name: String(photo.file_name || '').trim().slice(0, 180),
          mime_type: `image/${asset.format === 'jpg' ? 'jpeg' : asset.format}`.slice(0, 80),
          bytes: asset.bytes,
        });
      }
      const result = await this.progressCheckInRepository.createOnce({
        id,
        userId,
        date,
        scalp_region: String(body.scalp_region || 'Scalp').trim().slice(0, 100),
        shedding_level: String(body.shedding_level || 'Not recorded').trim().slice(0, 100),
        notes: String(body.notes || '').trim().slice(0, 2000),
        density_rating: Math.max(1, Math.min(5, Number(body.density_rating) || 3)),
        photos: cleanPhotos,
      });
      persisted = true;
      if (result.created) {
        try {
          await this.patientActivityRepository.record({ userId, type: 'progress', title: 'Daily progress photos uploaded', summary: `${cleanPhotos.length} photo${cleanPhotos.length === 1 ? '' : 's'} · ${result.item.scalp_region}`, actor: 'Patient app', metadata: { check_in_id: result.item.id } });
        } catch { /* progress persistence must not fail because an activity event could not be recorded */ }
      } else {
        const retainedIds = new Set((result.item.photos || []).map((photo) => photo.public_id));
        await Promise.all(cleanPhotos
          .filter((photo) => !retainedIds.has(photo.public_id))
          .map((photo) => this.imageStorage.deleteImage(photo.public_id, { deliveryType: photo.delivery_type }).catch(() => null)));
      }
      return sendSuccess(res, { message: 'Progress check-in saved to your clinical record.', statusCode: result.created ? 201 : 200, data: { item: await progressCheckInResponse(result.item, this.imageStorage) } });
    } catch (error) {
      if (!persisted && cleanPhotos.length > 0) {
        await Promise.all(cleanPhotos.map((photo) => this.imageStorage.deleteImage(photo.public_id, { deliveryType: photo.delivery_type }).catch(() => null)));
      }
      next(error);
    }
  };

  deleteProgressPhoto = async (req, res, next) => {
    try {
      const angle = String(req.params.angle || '').toLowerCase();
      if (!['front', 'top', 'back'].includes(angle)) throw new BadRequestError('angle must be front, top, or back.');
      const photo = await this.progressCheckInRepository.removePhoto(req.user.id, req.params.checkInId, angle);
      if (!photo) throw new NotFoundError('Progress photo was not found.');
      try {
        await this.imageStorage.deleteImage(photo.public_id, { deliveryType: photo.delivery_type || 'upload' });
      } catch {
        await this.progressCheckInRepository.restorePhoto(req.user.id, req.params.checkInId, photo);
        throw new AppError('The photo could not be deleted from storage. The clinical record was restored; retry later.', 503);
      }
      return sendSuccess(res, { message: 'Progress photo deleted from storage and the clinical record.' });
    } catch (error) {
      next(error);
    }
  };

  deleteProgressCheckIn = async (req, res, next) => {
    try {
      const userId = Number(req.user.id);
      const checkInId = req.params.checkInId;
      const checkIn = await this.progressCheckInRepository.findById(userId, checkInId);
      if (!checkIn) throw new NotFoundError('Progress check-in not found.');

      if (Array.isArray(checkIn.photos)) {
        await Promise.all(
          checkIn.photos.map((photo) =>
            this.imageStorage.deleteImage(photo.public_id, { deliveryType: photo.delivery_type || 'authenticated' }).catch(() => null)
          )
        );
      }
      await this.progressCheckInRepository.removeCheckIn(userId, checkInId);
      if (this.patientActivityRepository?.record) {
        await this.patientActivityRepository.record({
          userId,
          type: 'progress',
          title: 'Progress check-in deleted',
          summary: `Check-in ${checkInId} removed`,
          actor: 'Patient app',
          metadata: { check_in_id: checkInId },
        }).catch(() => null);
      }
      return sendSuccess(res, { message: 'Progress check-in removed from clinical record.' });
    } catch (error) {
      next(error);
    }
  };

  downloadReport = async (req, res, next) => {
    try {
      const report = await this.clinicalReportRepository.findByUserIdAndId(req.user.id, req.params.reportId);
      if (!report || report.visibility !== 'Shared') throw new NotFoundError('Patient report not found.');
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

  getRoutineSteps = async (req, res, next) => {
    try {
      const userId = Number(req.user.id);
      const steps = this.treatmentRepository?.getRoutineSteps
        ? await this.treatmentRepository.getRoutineSteps(userId)
        : [];
      return sendSuccess(res, {
        data: {
          routine_steps: steps,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  addRoutineStep = async (req, res, next) => {
    try {
      const userId = Number(req.user.id);
      const { title, subtitle, category, time_of_day } = req.body || {};
      if (!title || typeof title !== 'string' || !title.trim()) {
        throw new BadRequestError('Care step title is required.');
      }

      const step = {
        title: title.trim().slice(0, 150),
        subtitle: typeof subtitle === 'string' ? subtitle.trim().slice(0, 300) : '',
        category: typeof category === 'string' ? category.trim().slice(0, 80) : 'Lifestyle',
        time_of_day: typeof time_of_day === 'string' ? time_of_day.trim().slice(0, 50) : 'Daily',
      };

      const updated = this.treatmentRepository?.addRoutineStep
        ? await this.treatmentRepository.addRoutineStep(userId, step)
        : [step];

      if (this.patientActivityRepository?.record) {
        await this.patientActivityRepository.record({
          userId,
          type: 'routine',
          title: 'Care routine step added',
          summary: step.title,
          actor: 'Patient app',
          metadata: { step_title: step.title },
        }).catch(() => null);
      }

      return sendSuccess(res, {
        message: 'Care routine step added successfully.',
        statusCode: 201,
        data: {
          routine_steps: updated,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteRoutineStep = async (req, res, next) => {
    try {
      const userId = Number(req.user.id);
      const stepIndex = parseInt(req.params.stepIndex, 10);
      if (Number.isNaN(stepIndex) || stepIndex < 0) {
        throw new BadRequestError('A valid step index is required.');
      }

      const updated = this.treatmentRepository?.removeRoutineStep
        ? await this.treatmentRepository.removeRoutineStep(userId, stepIndex)
        : [];

      return sendSuccess(res, {
        message: 'Care routine step removed.',
        data: {
          routine_steps: updated,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getReminders = async (req, res, next) => {
    try {
      const userId = Number(req.user.id);
      const reminders = this.treatmentRepository?.getReminders
        ? await this.treatmentRepository.getReminders(userId)
        : [];
      return sendSuccess(res, {
        data: {
          reminders,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  saveReminder = async (req, res, next) => {
    try {
      const userId = Number(req.user.id);
      const body = req.body || {};
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        throw new BadRequestError('Care reminder title is required.');
      }

      const reminder = {
        id: String(body.id || `rem_${Date.now()}`),
        title: title.slice(0, 150),
        subtitle: typeof body.subtitle === 'string' ? body.subtitle.trim().slice(0, 300) : '',
        time: typeof body.time === 'string' ? body.time.trim().slice(0, 20) : '20:00',
        hour: typeof body.hour === 'number' ? body.hour : 20,
        minute: typeof body.minute === 'number' ? body.minute : 0,
        isEnabled: body.isEnabled !== false,
        frequency: typeof body.frequency === 'string' ? body.frequency.trim().slice(0, 50) : 'Daily',
        treatmentType: typeof body.treatmentType === 'string' ? body.treatmentType.trim().slice(0, 80) : 'Topical Serum',
        repeatDays: Array.isArray(body.repeatDays) ? body.repeatDays.map(Number).filter((d) => d >= 1 && d <= 7) : [1, 2, 3, 4, 5, 6, 7],
        isCompleted: Boolean(body.isCompleted),
        notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '',
        snoozedUntil: body.snoozedUntil || null,
      };

      const updated = this.treatmentRepository?.saveReminder
        ? await this.treatmentRepository.saveReminder(userId, reminder)
        : [reminder];

      return sendSuccess(res, {
        message: 'Care reminder saved successfully.',
        statusCode: 200,
        data: {
          reminder,
          reminders: updated,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteReminder = async (req, res, next) => {
    try {
      const userId = Number(req.user.id);
      const reminderId = String(req.params.reminderId || '').trim();
      if (!reminderId) {
        throw new BadRequestError('A valid reminder ID is required.');
      }

      const updated = this.treatmentRepository?.deleteReminder
        ? await this.treatmentRepository.deleteReminder(userId, reminderId)
        : [];

      return sendSuccess(res, {
        message: 'Care reminder removed.',
        data: {
          reminders: updated,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
