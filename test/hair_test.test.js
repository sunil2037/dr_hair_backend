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

  const mockAiAssessment = {
    ai_status: 'available',
    scalp_health_score: 75,
    stage_classification: 'Norwood Stage 2',
    summary: 'Mild temporal recession with healthy crown follicles.',
    root_causes: [{ factor: 'Stress', severity: 'Moderate', explanation: 'Reported high stress.' }],
    diet_plan: {
      summary: 'Protein-rich balanced diet',
      foods_to_eat: ['Almonds', 'Eggs'],
      foods_to_avoid: ['Refined Sugar'],
      hydration_target: '2.5L daily',
      key_nutrients: ['Iron', 'Zinc'],
    },
    lifestyle_guidance: {
      scalp_care_tips: ['Wash hair 3 times a week'],
      habits_to_avoid: ['Hot showers'],
      sleep_stress_advice: 'Aim for 7-8 hours sleep',
    },
    recommended_regimen: {
      summary: 'Daily gentle cleansing & nourishment',
      daily_steps: [{ time_of_day: 'Morning', action: 'Apply mild serum', frequency: 'Daily' }],
      target_products: [{ category: 'Hair Care', rationale: 'Mild scalp shampoo' }],
    },
    next_step_recommendation: { type: 'products', reason: 'Self-care regimen' },
    generated_by: 'Dr. Hair Assistant (gemini-3.5-flash-lite)',
    generated_at: new Date().toISOString(),
  };
  container.services.geminiAiService.generateHairTestAssessment = async () => mockAiAssessment;

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
    assert.equal(result.test.ai_assessment, null);
    assert.equal(result.test.ai_assessment_status, 'queued');
    assert.equal(result.ai_assessment_status, 'queued');
    createdReferenceNo = result.reference_no;
  });

  it('processes the queued AI assessment after the submit response', async () => {
    let status = await container.repositories.hairTestRepository.getAiAssessmentStatus(createdReferenceNo, 12);
    for (let attempt = 0; status?.status === 'queued' && attempt < 25; attempt += 1) {
      const processed = await container.useCases.processQueuedAiAssessmentUseCase.processOne();
      if (!processed) break;
      status = await container.repositories.hairTestRepository.getAiAssessmentStatus(createdReferenceNo, 12);
    }
    assert.equal(status.status, 'ready');
    assert.equal(typeof status.ai_assessment.scalp_health_score, 'number');
  });

  it('archives an assessment from patient history without deleting the admin record and restores it with a reason', async () => {
    const repository = container.repositories.hairTestRepository;
    const record = await repository.create({ userId: 9912, full_name: 'Archive Test', status: 'submitted' });
    await repository.updateStatus(record.reference_no, 'archived', { changed_by: 'Admin', note: 'Duplicate submission confirmed' });
    assert.equal((await repository.findByUserId(9912)).length, 0);
    assert.equal((await repository.findByUserId(9912, { includeArchived: true })).length, 1);
    await repository.updateStatus(record.reference_no, 'submitted', { changed_by: 'Admin', note: 'Restore after review' });
    assert.equal((await repository.findByUserId(9912)).length, 1);
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

