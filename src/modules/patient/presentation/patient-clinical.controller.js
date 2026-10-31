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
  constructor({ hairTestRepository, treatmentRepository, clinicalReportRepository, appointmentRepository, progressCheckInRepository, patientActivityRepository, imageStorage }) {
    this.hairTestRepository = hairTestRepository;
    this.treatmentRepository = treatmentRepository;
    this.clinicalReportRepository = clinicalReportRepository;
    this.appointmentRepository = appointmentRepository;
    this.progressCheckInRepository = progressCheckInRepository;
    this.patientActivityRepository = patientActivityRepository;
    this.imageStorage = imageStorage;
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
          assessments: await Promise.all(assessments.map(async (assessment) => ({
            ...assessment,
            scalp_photos: await Promise.all((assessment.scalp_photos || []).filter((photo) => !photo.deleted_at).map(async (photo) => ({
              ...photo,
              url: photo.delivery_type === 'authenticated'
                ? this.imageStorage.createPrivateDownloadUrl(photo.file_name, photo.format)
                : photo.url,
              url_expires_in_seconds: photo.delivery_type === 'authenticated' ? 300 : null,
            }))),
          }))),
          care_plans: carePlans.map((plan) => ({ ...plan.toResponse(), reference_no: plan.reference_no })),
          reports: reports.map(publicReport),
          appointments,
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
}
