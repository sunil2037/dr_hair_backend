import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAiService } from '../src/modules/ai/infrastructure/GeminiAiService.js';
import { config } from '../src/config/env.js';

describe('GeminiAiService Unit & Integration Tests', () => {
  it('should not invent a score, stage, or product plan when no API key is provided', async () => {
    const service = new GeminiAiService({ apiKey: '' });
    const result = await service.generateHairTestAssessment({
      gender: 'Male',
      daily_hair_fall: '100+ hairs',
      stress_level: 'High',
      dandruff: 'Moderate',
      protein_intake: 'Low',
    });

    assert.ok(result);
    assert.equal(result.ai_status, 'unavailable');
    assert.equal(result.scalp_health_score, null);
    assert.equal(result.stage_classification, null);
    assert.deepEqual(result.root_causes, []);
    assert.deepEqual(result.recommended_regimen.daily_steps, []);
    assert.deepEqual(result.recommended_regimen.target_products, []);
    assert.equal(result.next_step_recommendation.type, 'unavailable');
    assert.equal(result.generated_by, 'unavailable');
  });

  it('should direct reported rapid or patchy loss to a clinician if AI is unavailable', async () => {
    const service = new GeminiAiService({ apiKey: '' });
    const result = await service.generateHairTestAssessment({
      hair_fall_increasing: 'Yes',
      hair_fall_pattern: 'Patchy hair loss',
    });

    assert.equal(result.ai_status, 'unavailable');
    assert.equal(result.next_step_recommendation.type, 'doctor_appointment');
    assert.match(result.next_step_recommendation.reason, /clinician/i);
  });

  it('should parse valid JSON returned from mocked Gemini API', async () => {
    const mockApiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  scalp_health_score: 82,
                  stage_classification: 'Norwood Stage 2',
                  summary: 'Early hairline recession with good follicular density at crown.',
                  root_causes: [
                    { factor: 'DHT Sensitivity', severity: 'Moderate', explanation: 'Mild temple thinning.' },
                  ],
                  diet_plan: {
                    summary: 'High protein diet',
                    foods_to_eat: ['Eggs', 'Spinach'],
                    foods_to_avoid: ['Sugary soda'],
                    hydration_target: '3L',
                    key_nutrients: ['Biotin', 'Zinc'],
                  },
                  lifestyle_guidance: {
                    summary: 'Gentle scalp care',
                    scalp_care_tips: ['Wash 3x/week'],
                    oiling_rules: ['No overnight oiling'],
                    sleep_and_stress: ['8 hours sleep'],
                  },
                  recommended_regimen: {
                    summary: 'Growth serum + Biotin',
                    daily_steps: [{ step: 'Morning', instruction: 'Apply serum' }],
                    target_products: [{ name: 'Growth Serum', category: 'Serums', reason: 'Strengthens follicles' }],
                  },
                }),
              },
            ],
          },
        },
      ],
    };

    const mockFetch = async () => ({
      ok: true,
      json: async () => mockApiResponse,
    });

    const service = new GeminiAiService({
      apiKey: 'test-fake-key',
      fetchFn: mockFetch,
    });

    const result = await service.generateHairTestAssessment({ gender: 'Male' });
    assert.equal(result.scalp_health_score, 82);
    assert.equal(result.stage_classification, 'Norwood Stage 2');
    assert.ok(result.generated_by.includes('Dr. Hair Assistant'));
    assert.equal(result.ai_status, 'available');
    assert.equal(result.root_causes[0].factor, 'DHT Sensitivity');
  });

  it('should attach up to two owned private scalp photos to the Gemini request', async () => {
    let sentParts = [];
    const service = new GeminiAiService({
      apiKey: 'test-fake-key',
      imageStorage: {
        downloadAuthenticatedImage: async (publicId) => ({
          data: `encoded-${publicId}`,
          mimeType: 'image/jpeg',
        }),
      },
      fetchFn: async (_url, options) => {
        sentParts = JSON.parse(options.body).contents[0].parts;
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify({
              scalp_health_score: 81,
              stage_classification: 'Reported thinning pattern',
              summary: 'A non-diagnostic screening summary.',
              recommended_regimen: { daily_steps: [] },
            }) }] } }],
          }),
        };
      },
      logger: { warn() {}, error() {} },
    });

    await service.generateHairTestAssessment({
      scalp_photos: [
        { file_name: 'assessment/front', format: 'jpg', delivery_type: 'authenticated' },
        { file_name: 'assessment/top', format: 'jpg', delivery_type: 'authenticated' },
        { file_name: 'assessment/third', format: 'jpg', delivery_type: 'authenticated' },
        { file_name: 'assessment/public', format: 'jpg', delivery_type: 'upload' },
      ],
    });

    const imageParts = sentParts.filter((part) => part.inline_data);
    assert.equal(imageParts.length, 2);
    assert.deepEqual(imageParts.map((part) => part.inline_data.data), [
      'encoded-assessment/front',
      'encoded-assessment/top',
    ]);
  });

  it('should use the configured fallback model when the primary model is unavailable', async () => {
    const models = [];
    const service = new GeminiAiService({
      apiKey: 'test-fake-key',
      model: 'primary-model',
      fallbackModel: 'fallback-model',
      fetchFn: async (url) => {
        const model = decodeURIComponent(url.match(/models\/([^:]+)/)[1]);
        models.push(model);
        if (model === 'primary-model') {
          return { ok: false, status: 404, text: async () => 'not found' };
        }
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify({
              scalp_health_score: 81,
              stage_classification: 'Reported thinning pattern',
              summary: 'A non-diagnostic screening summary.',
              recommended_regimen: { daily_steps: [] },
            }) }] } }],
          }),
        };
      },
      logger: { warn() {}, error() {} },
    });

    const result = await service.generateHairTestAssessment({});
    assert.deepEqual(models, ['primary-model', 'fallback-model']);
    assert.equal(result.generated_by, 'Dr. Hair Assistant (fallback-model)');
  });

  it('should return unavailable without fabricated results when Gemini fails', async () => {
    const mockFailingFetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const service = new GeminiAiService({
      apiKey: 'test-fake-key',
      fetchFn: mockFailingFetch,
    });

    const result = await service.generateHairTestAssessment({ gender: 'Female' });
    assert.ok(result);
    assert.equal(result.ai_status, 'unavailable');
    assert.equal(result.scalp_health_score, null);
    assert.equal(result.stage_classification, null);
    assert.deepEqual(result.recommended_regimen.target_products, []);
  });

  if (config.gemini?.apiKey) {
    it('should successfully call live Gemini API with configured key', async () => {
      const service = new GeminiAiService();
      const result = await service.generateHairTestAssessment({
        age: '29',
        gender: 'Male',
        duration: '1 year',
        hair_fall_pattern: 'Receding hairline & crown',
        daily_hair_fall: '50-100 hairs',
        dandruff: 'Mild',
        scalp_condition: 'Oily',
        stress_level: 'Moderate',
        diet_type: 'Vegetarian',
        protein_intake: 'Low',
      });

      assert.ok(result);
      assert.equal(typeof result.scalp_health_score, 'number');
      assert.ok(result.scalp_health_score >= 10 && result.scalp_health_score <= 100);
      assert.ok(result.root_causes.length > 0);
      assert.ok(result.diet_plan.foods_to_eat.length > 0);
      assert.ok(result.lifestyle_guidance.scalp_care_tips.length > 0);
      assert.ok(result.recommended_regimen.daily_steps.length > 0);
      console.log('Live Gemini Test Result:', {
        score: result.scalp_health_score,
        stage: result.stage_classification,
        generated_by: result.generated_by,
        root_causes_count: result.root_causes.length,
      });
    });

    it('should test detectHairAndScalpImage with Gemini vision', async () => {
      const service = new GeminiAiService();
      const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const detection = await service.detectHairAndScalpImage({
        base64Data: tinyPng,
        mimeType: 'image/png',
        label: 'Front Hairline',
      });
      assert.ok(detection);
      assert.equal(typeof detection.is_hair, 'boolean');
      assert.ok(detection.status);
      assert.ok(detection.message);
    });
  }
});

