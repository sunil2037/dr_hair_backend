import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';

describe('Hair Test & Treatment Modules - Clean Architecture Tests', () => {
  const container = createContainer();
  const {
    submitHairTestUseCase,
    getHairTestsUseCase,
    getTreatmentHistoryUseCase,
  } = container.useCases;
  submitHairTestUseCase.imageStorage = {
    uploadImage: async (_buffer, folder) => ({
      publicId: `${folder}/test-scalp-image`,
      secureUrl: 'https://res.cloudinary.com/test/image/upload/test-scalp-image.jpg',
    }),
  };

  let createdReferenceNo = '';

  it('should submit a multi-step hair test with scalp photos', async () => {
    const result = await submitHairTestUseCase.execute({
      userId: 12,
      formData: {
        full_name: 'Sunil Sharma',
        email: 'user@example.com',
        phone: '9876543210',
        age: '28',
        gender: 'Male',
        city: 'Mumbai',
        occupation: 'Software Engineer',
        hair_fall_start: '6 months ago',
        hair_fall_pattern: 'Crown thinning',
        daily_hair_fall: '50-100 hairs',
        hair_fall_increasing: 'Yes',
        dandruff: 'Mild',
        scalp_condition: 'Oily',
        scalp_symptoms: '["Itching", "Excess oil"]',
        hair_type: 'Wavy',
        medical_conditions: '["None"]',
        recent_events: '["High Stress"]',
        stress_level: 'High',
        sleep_quality: 'Fair',
        diet_type: 'Non-veg',
        protein_intake: 'Moderate',
        family_history: 'Grandfather',
        have_taken_treatment: 'No',
        previous_treatments: '[]',
        treatment_results: 'N/A',
        main_concern: 'Crown thinning',
        looking_for: 'Medical diagnosis',
        hair_loss_stage: 'Stage-2',
      },
      files: {
        photo_front: [{ filename: 'scalp_front_test.jpg', buffer: Buffer.from('front image') }],
        photo_top: [{ filename: 'scalp_top_test.jpg', buffer: Buffer.from('top image') }],
      },
    });

    assert.equal(result.message, 'Hair test submitted successfully.');
    assert.ok(result.reference_no.startsWith('HT-'));
    assert.ok(result.test.ai_assessment);
    assert.equal(typeof result.test.ai_assessment.scalp_health_score, 'number');
    assert.ok(result.test.ai_assessment.diet_plan.foods_to_eat.length > 0);
    createdReferenceNo = result.reference_no;
  });

  it('should generate on-demand AI assessment for an existing hair test', async () => {
    const aiResult = await container.useCases.generateHairTestAiAssessmentUseCase.execute({
      userId: 12,
      referenceNo: createdReferenceNo,
    });

    assert.ok(aiResult.ai_assessment);
    assert.equal(typeof aiResult.ai_assessment.scalp_health_score, 'number');
    assert.ok(aiResult.ai_assessment.root_causes.length > 0);
    assert.ok(aiResult.ai_assessment.lifestyle_guidance.scalp_care_tips.length > 0);
    assert.ok(aiResult.ai_assessment.recommended_regimen.target_products.length > 0);
  });

  it('should retrieve user hair tests history', async () => {
    const history = await getHairTestsUseCase.execute({ userId: 12 });
    assert.ok(Array.isArray(history));
    assert.ok(history.length >= 1);
    assert.ok(history[0].reference_no);
    assert.ok(history[0].hair_loss_stage);
  });

  it('should retrieve doctor treatment history by reference_no', async () => {
    const treatments = await getTreatmentHistoryUseCase.execute({
      referenceNoOrId: 'HT-2026-0042',
      userId: 12,
    });

    assert.ok(Array.isArray(treatments));
    assert.ok(treatments.length >= 1);
    assert.equal(treatments[0].treatment_name, 'PRP + Minoxidil 5%');
    assert.equal(treatments[0].doctor_name, 'Dr. Hair Specialist');
  });
});

