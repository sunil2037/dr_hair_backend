import { BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';

export class SubmitHairTestUseCase {
  constructor({ hairTestRepository, imageStorage }) {
    this.hairTestRepository = hairTestRepository;
    this.imageStorage = imageStorage;
  }

  async execute({ userId, formData, files = {} }) {
    if (!formData.full_name && !formData.name) {
      throw new BadRequestError('Full name is required.');
    }

    // Helper to safely parse stringified JSON array fields from multipart/form-data
    const parseJsonArray = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim().startsWith('[')) {
        try {
          return JSON.parse(val);
        } catch {
          return [val];
        }
      }
      return val ? [val] : [];
    };

    const boundedText = (value, field, maxLength) => {
      if (value == null || value === '') return '';
      if (typeof value !== 'string') throw new BadRequestError(`${field} must be text.`);
      const normalized = value.trim();
      if (normalized.length > maxLength) throw new BadRequestError(`${field} must be at most ${maxLength} characters.`);
      return normalized;
    };
    const allergyStatus = boundedText(formData.allergy_status, 'allergy_status', 60);
    const currentMedicationsStatus = boundedText(formData.current_medications_status, 'current_medications_status', 60);
    const allergyDetails = boundedText(formData.allergy_details, 'allergy_details', 500);
    const currentMedications = boundedText(formData.current_medications, 'current_medications', 1000);
    if (allergyStatus && !['No known allergies', 'Yes, I have allergies', 'Not sure'].includes(allergyStatus)) {
      throw new BadRequestError('Choose a valid allergy status.');
    }
    if (currentMedicationsStatus && !['No', 'Yes', 'Not sure'].includes(currentMedicationsStatus)) {
      throw new BadRequestError('Choose a valid current medicines status.');
    }
    if (allergyStatus === 'Yes, I have allergies' && !allergyDetails) {
      throw new BadRequestError('List the known allergies before submitting.');
    }
    if (currentMedicationsStatus === 'Yes' && !currentMedications) {
      throw new BadRequestError('List current medicines or supplements before submitting.');
    }

    // Process scalp photo uploads
    const scalpPhotos = [];
    const photoKeys = ['photo_front', 'photo_top', 'photo_left', 'photo_right', 'photo_back'];

    try {
      for (const key of photoKeys) {
        const uploadedFiles = files[key] || [];
        const suppliedUrl = formData[`${key}_url`];
        if (uploadedFiles.length > 0 && suppliedUrl) {
          throw new BadRequestError(`Send either ${key} or ${key}_url, not both.`);
        }

        if (uploadedFiles[0]) {
          const uploaded = await this.imageStorage.uploadImage(
            uploadedFiles[0].buffer,
            `user-${userId}/assessment`,
            undefined,
            { deliveryType: 'authenticated' },
          );
          scalpPhotos.push({
            file_name: uploaded.publicId,
            url: uploaded.storageUrl,
            delivery_type: 'authenticated',
            format: uploaded.format,
            angle: key.replace('photo_', ''),
          });
        } else if (suppliedUrl) {
        const url = String(suppliedUrl).trim();
        let parsedUrl;
        try {
          parsedUrl = new URL(url);
        } catch {
          throw new BadRequestError(`${key}_url must be a valid uploaded image URL.`);
        }
        const uploadMarker = `/${config.cloudinary.cloudName}/image/authenticated/`;
        if (
          parsedUrl.protocol !== 'https:'
          || parsedUrl.hostname !== 'res.cloudinary.com'
          || !config.cloudinary.cloudName
          || !parsedUrl.pathname.includes(uploadMarker)
        ) {
          throw new BadRequestError(`${key}_url must be an image uploaded to the configured Cloudinary account.`);
        }
        const pathParts = (parsedUrl.pathname.split(uploadMarker)[1] || '').split('/').filter(Boolean);
        if (/^s--.+--$/.test(pathParts[0] || '')) pathParts.shift();
        if (/^v\d+$/.test(pathParts[0] || '')) pathParts.shift();
        const publicId = pathParts.join('/').replace(/\.[a-zA-Z0-9]+$/, '');
        const ownedFolder = `${config.cloudinary.imageFolder}/user-${userId}/assessment/`;
        if (!publicId.startsWith(ownedFolder)) {
          throw new UnauthorizedError(`${key}_url must belong to the authenticated patient's assessment uploads.`);
        }
        let asset;
        try { asset = await this.imageStorage.getAuthenticatedImage(publicId); }
        catch { throw new BadRequestError(`${key}_url must reference an authenticated private image uploaded for this assessment.`); }
        if (asset.type !== 'authenticated' || asset.public_id !== publicId) {
          throw new BadRequestError(`${key}_url must reference an authenticated private image uploaded for this assessment.`);
        }
        scalpPhotos.push({
          file_name: publicId,
          url: asset.secure_url,
          delivery_type: 'authenticated',
          format: asset.format,
          bytes: asset.bytes,
          angle: key.replace('photo_', ''),
        });
      }
      }
    } catch (error) {
      await Promise.all(scalpPhotos.map((photo) => this.imageStorage.deleteImage(photo.file_name, { deliveryType: photo.delivery_type }).catch(() => null)));
      throw error;
    }

    let hairTest;
    try {
      hairTest = await this.hairTestRepository.create({
      userId: userId ? parseInt(userId, 10) : null,
      full_name: formData.full_name || formData.name,
      email: formData.email,
      phone: formData.phone,
      age: formData.age ? parseInt(formData.age, 10) : null,
      gender: formData.gender,
      city: formData.city,
      occupation: formData.occupation,
      hair_fall_start: formData.hair_fall_start || formData.duration,
      duration: formData.duration || formData.hair_fall_start,
      hair_fall_pattern: formData.hair_fall_pattern,
      daily_hair_fall: formData.daily_hair_fall,
      hair_fall_increasing: formData.hair_fall_increasing,
      dandruff: formData.dandruff,
      scalp_condition: formData.scalp_condition,
      scalp_symptoms: parseJsonArray(formData.scalp_symptoms),
      hair_type: formData.hair_type,
      medical_conditions: parseJsonArray(formData.medical_conditions),
      recent_events: parseJsonArray(formData.recent_events),
      stress_level: formData.stress_level,
      gut_health: formData.gut_health || formData.gutHealth,
      sleep_quality: formData.sleep_quality,
      diet_type: formData.diet_type,
      protein_intake: formData.protein_intake,
      family_history: formData.family_history,
      allergy_status: allergyStatus,
      allergy_details: allergyDetails,
      current_medications_status: currentMedicationsStatus,
      current_medications: currentMedications,
      have_taken_treatment: formData.have_taken_treatment,
      previous_treatments: parseJsonArray(formData.previous_treatments),
      treatment_results: formData.treatment_results,
      main_concern: formData.main_concern || formData.primary_concern,
      looking_for: formData.looking_for,
      hair_loss_stage: formData.hair_loss_stage || formData.stage,
        scalp_photos: scalpPhotos,
      });
    } catch (error) {
      await Promise.all(scalpPhotos.map((photo) => this.imageStorage.deleteImage(photo.file_name, { deliveryType: photo.delivery_type }).catch(() => null)));
      throw error;
    }

    return {
      message: 'Hair test submitted successfully.',
      reference_no: hairTest.reference_no,
      test: hairTest,
    };
  }
}

