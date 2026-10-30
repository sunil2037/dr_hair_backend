import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdminController } from '../src/modules/admin/presentation/admin.controller.js';

const responseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

describe('Admin prescription medicines', () => {
  it('validates and saves selected medicines with a treatment plan', async () => {
    let saved;
    const controller = new AdminController({
      hairTestRepository: { findByReferenceNo: async (referenceNo) => ({ id: 101, reference_no: referenceNo, userId: 12 }) },
      treatmentRepository: { create: async (treatment) => { saved = treatment; return { toResponse: () => ({ id: 51, ...treatment }) }; } },
    });
    const res = responseRecorder();

    await controller.createTreatment({ body: {
      reference_no: 'HT-2026-0042',
      treatment_name: 'Hair care plan',
      duration: '90 days',
      doctor_name: 'Dr. Example',
      diagnosis: 'Clinician-reviewed diagnosis',
      stage: 'Stage 2',
      next_review_date: '2026-11-30',
      medications: [{ catalog_id: 'PRD-101', name: 'Follicle Booster Serum', category: 'Topical regrowth', form: 'Serum', dose: '1 ml', frequency: 'Nightly', duration: '', instructions: '' }],
      routine_steps: [{ title: 'Apply serum', subtitle: 'Use on a dry scalp', category: 'Scalp care', time_of_day: 'Night' }],
      diet_meals: [{ type: 'Breakfast', name: 'Patient-selected meal', nutrients: 'Protein', benefit: 'Clinician note' }],
    } }, res, (error) => { throw error; });

    assert.equal(res.statusCode, 201);
    assert.equal(saved.medications.length, 1);
    assert.equal(saved.medications[0].name, 'Follicle Booster Serum');
    assert.equal(saved.diagnosis, 'Clinician-reviewed diagnosis');
    assert.equal(saved.next_review_date, '2026-11-30');
    assert.equal(saved.routine_steps[0].time_of_day, 'Night');
    assert.equal(saved.diet_meals[0].name, 'Patient-selected meal');
    assert.deepEqual(res.body.data.medications, saved.medications);
  });

  it('rejects a medicine without a dose or frequency before saving', async () => {
    const controller = new AdminController({
      hairTestRepository: { findByReferenceNo: async (referenceNo) => ({ id: 101, reference_no: referenceNo, userId: 12 }) },
      treatmentRepository: { create: async () => assert.fail('invalid prescription must not be saved') },
    });
    let error;

    await controller.createTreatment({ body: {
      reference_no: 'HT-2026-0042', treatment_name: 'Hair care plan',
      medications: [{ name: 'A clinic medicine', dose: ' ', frequency: '' }],
    } }, responseRecorder(), (caught) => { error = caught; });

    assert.equal(error?.statusCode, 400);
    assert.match(error?.message || '', /name, dose, and frequency/i);
  });

  it('rejects malformed personalized care steps before saving', async () => {
    const controller = new AdminController({
      hairTestRepository: { findByReferenceNo: async () => ({ id: 101, reference_no: 'HT-2026-0042', userId: 12 }) },
      treatmentRepository: { create: async () => assert.fail('invalid care plan must not be saved') },
    });
    let error;

    await controller.createTreatment({ body: {
      reference_no: 'HT-2026-0042', treatment_name: 'Hair care plan',
      routine_steps: [{ title: ' ' }],
    } }, responseRecorder(), (caught) => { error = caught; });

    assert.equal(error?.statusCode, 400);
    assert.match(error?.message || '', /routine step needs a title/i);
  });
});
