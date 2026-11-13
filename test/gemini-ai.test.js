import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAiService } from '../src/modules/ai/infrastructure/GeminiAiService.js';
import { config } from '../src/config/env.js';

describe('GeminiAiService Unit & Integration Tests', () => {
  it('should generate fallback assessment when no API key is provided', async () => {
    const service = new GeminiAiService({ apiKey: '' });
    const result = await service.generateHairTestAssessment({
      gender: 'Male',
      daily_hair_fall: '100+ hairs',
      stress_level: 'High',
      dandruff: 'Moderate',
      protein_intake: 'Low',
    });

    assert.ok(result);
    assert.equal(typeof result.scalp_health_score, 'number');
    assert.ok(result.scalp_health_score >= 20 && result.scalp_health_score <= 100);
    assert.ok(result.stage_classification.includes('Norwood'));
    assert.ok(Array.isArray(result.root_causes));
    assert.ok(result.root_causes.length > 0);
    assert.ok(result.diet_plan.foods_to_eat.length > 0);
    assert.ok(result.diet_plan.foods_to_avoid.length > 0);
    assert.ok(result.lifestyle_guidance.scalp_care_tips.length > 0);
    assert.ok(result.recommended_regimen.daily_steps.length > 0);
    assert.equal(result.generated_by, 'clinical-rules-engine');
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
    assert.ok(result.generated_by.includes('gemini-ai'));
    assert.equal(result.root_causes[0].factor, 'DHT Sensitivity');
  });

  it('should gracefully fall back when mock Gemini API returns 500 or network fails', async () => {
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
    assert.equal(typeof result.scalp_health_score, 'number');
    assert.ok(result.stage_classification.includes('Ludwig'));
    assert.equal(result.generated_by, 'clinical-rules-engine');
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
  }
});

