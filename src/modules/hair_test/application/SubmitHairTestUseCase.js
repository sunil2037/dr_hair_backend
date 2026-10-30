import { BadRequestError } from '../../../shared/errors/index.js';

export class SubmitHairTestUseCase {
  constructor({ hairTestRepository }) {
    this.hairTestRepository = hairTestRepository;
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

    // Process scalp photo uploads
    const scalpPhotos = [];
    const photoKeys = ['photo_front', 'photo_top', 'photo_left', 'photo_right', 'photo_back'];

    photoKeys.forEach((key) => {
      if (files[key] && files[key][0]) {
        const uploaded = files[key][0];
        scalpPhotos.push({
          file_name: uploaded.filename,
          url: `uploads/scalp/${uploaded.filename}`,
          angle: key.replace('photo_', ''),
        });
      }
    });

    const hairTest = await this.hairTestRepository.create({
      userId: userId ? parseInt(userId, 10) : null,
      full_name: formData.full_name || formData.name,
      email: formData.email,
      phone: formData.phone,
      age: formData.age ? parseInt(formData.age, 10) : null,
      gender: formData.gender,
      city: formData.city,
      occupation: formData.occupation,
      hair_fall_start: formData.hair_fall_start,
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
      sleep_quality: formData.sleep_quality,
      diet_type: formData.diet_type,
      protein_intake: formData.protein_intake,
      family_history: formData.family_history,
      have_taken_treatment: formData.have_taken_treatment,
      previous_treatments: parseJsonArray(formData.previous_treatments),
      treatment_results: formData.treatment_results,
      main_concern: formData.main_concern,
      looking_for: formData.looking_for,
      hair_loss_stage: formData.hair_loss_stage,
      scalp_photos: scalpPhotos,
    });

    return {
      message: 'Hair test submitted successfully.',
      reference_no: hairTest.reference_no,
      test: hairTest,
    };
  }
}

