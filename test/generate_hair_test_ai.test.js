import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GenerateHairTestAiAssessmentUseCase } from '../src/modules/hair_test/application/GenerateHairTestAiAssessmentUseCase.js';
import { GeminiAiService } from '../src/modules/ai/infrastructure/GeminiAiService.js';
import { UnauthorizedError } from '../src/shared/errors/index.js';

describe('GenerateHairTestAiAssessmentUseCase ownership', () => {
  it('keeps direct identifiers out of the model prompt', () => {
    const prompt = new GeminiAiService({ apiKey: 'test-only' })._buildPrompt({
      full_name: 'Private Patient Name',
      phone: '9999999999',
      email: 'private@example.test',
      age: 29,
      dandruff: 'Mild',
      allergy_details: 'Peanuts',
    });
    assert.equal(prompt.includes('Private Patient Name'), false);
    assert.equal(prompt.includes('9999999999'), false);
    assert.equal(prompt.includes('private@example.test'), false);
    assert.equal(prompt.includes('Peanuts'), true);
  });

  it('does not generate an AI report for another patient assessment', async () => {
    let generated = false;
    const useCase = new GenerateHairTestAiAssessmentUseCase({
      hairTestRepository: {
        findByReferenceNo: async () => ({ reference_no: 'HT-TEST-0001', userId: 12 }),
      },
      geminiAiService: {
        generateHairTestAssessment: async () => {
          generated = true;
          return {};
        },
      },
    });

    await assert.rejects(
      useCase.execute({ userId: 13, referenceNo: 'HT-TEST-0001' }),
      UnauthorizedError,
    );
    assert.equal(generated, false);
  });

  it('does not expose an unowned legacy assessment to an authenticated patient', async () => {
    const useCase = new GenerateHairTestAiAssessmentUseCase({
      hairTestRepository: {
        findByReferenceNo: async () => ({ reference_no: 'HT-TEST-0002', userId: null }),
      },
      geminiAiService: { generateHairTestAssessment: async () => ({}) },
    });

    await assert.rejects(
      useCase.execute({ userId: 13, referenceNo: 'HT-TEST-0002' }),
      UnauthorizedError,
    );
  });
});
