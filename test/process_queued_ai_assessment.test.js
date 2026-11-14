import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProcessQueuedAiAssessmentUseCase } from '../src/modules/hair_test/application/ProcessQueuedAiAssessmentUseCase.js';

describe('ProcessQueuedAiAssessmentUseCase', () => {
  it('claims a queued assessment, filters products, and saves the result', async () => {
    const calls = [];
    const useCase = new ProcessQueuedAiAssessmentUseCase({
      hairTestRepository: {
        claimNextAiAssessment: async () => ({ reference_no: 'HT-TEST-1', userId: 7 }),
        saveAiAssessment: async (ref, assessment) => {
          calls.push(['save', ref, assessment]);
          return { reference_no: ref };
        },
      },
      geminiAiService: {
        generateHairTestAssessment: async () => ({ summary: 'screening result' }),
      },
      assessmentProductAvailabilityService: {
        resolve: async (assessment) => ({ ...assessment, available_products: [] }),
      },
      logger: { info() {}, error() {} },
    });

    assert.equal(await useCase.processOne(), true);
    assert.equal(calls[0][1], 'HT-TEST-1');
    assert.deepEqual(calls[0][2], { summary: 'screening result', available_products: [] });
  });

  it('records a safe failure state without leaking provider errors', async () => {
    let failure;
    const useCase = new ProcessQueuedAiAssessmentUseCase({
      hairTestRepository: {
        claimNextAiAssessment: async () => ({ reference_no: 'HT-TEST-2' }),
        markAiAssessmentFailed: async (...args) => { failure = args; },
      },
      geminiAiService: {
        generateHairTestAssessment: async () => { throw new Error('patient data in provider error'); },
      },
      logger: { info() {}, error() {} },
    });

    assert.equal(await useCase.processOne(), true);
    assert.deepEqual(failure, ['HT-TEST-2', 'processing_failed']);
  });

  it('returns false when the queue is empty', async () => {
    const useCase = new ProcessQueuedAiAssessmentUseCase({
      hairTestRepository: { claimNextAiAssessment: async () => null },
      geminiAiService: {},
    });
    assert.equal(await useCase.processOne(), false);
  });
});
