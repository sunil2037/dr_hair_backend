import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SubmitHairTestUseCase } from '../src/modules/hair_test/application/SubmitHairTestUseCase.js';

describe('Flutter hair assessment fields', () => {
  it('persists the current mobile questionnaire answers against the authenticated account', async () => {
    let saved;
    const useCase = new SubmitHairTestUseCase({
      hairTestRepository: { create: async (data) => { saved = data; return { ...data, reference_no: 'HT-2026-0001' }; } },
      imageStorage: {},
    });

    const result = await useCase.execute({
      userId: '42',
      formData: {
        full_name: 'Patient Name',
        age: '31',
        gender: 'Female',
        primary_concern: 'Temple thinning',
        stage: 'Stage 2',
        duration: '6 to 12 months',
        dandruff: 'Itchy scalp',
        gut_health: 'Sometimes bloated',
        stress_level: 'High',
        family_history: 'Yes',
      },
    });

    assert.equal(saved.userId, 42);
    assert.equal(saved.full_name, 'Patient Name');
    assert.equal(saved.age, 31);
    assert.equal(saved.gender, 'Female');
    assert.equal(saved.main_concern, 'Temple thinning');
    assert.equal(saved.hair_loss_stage, 'Stage 2');
    assert.equal(saved.duration, '6 to 12 months');
    assert.equal(saved.gut_health, 'Sometimes bloated');
    assert.equal(result.reference_no, 'HT-2026-0001');
  });
});
