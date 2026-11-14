import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PatientClinicalController } from '../src/modules/patient/presentation/patient-clinical.controller.js';

const recorder = () => ({
  body: null,
  statusCode: 200,
  json(body) { this.body = body; return this; },
  status(code) { this.statusCode = code; return this; },
});

describe('Patient Home Summary APIs & Priority Logic', () => {
  it('prioritizes clinician-urgent card when assessment requires doctor review and suppresses products', async () => {
    const controller = new PatientClinicalController({
      hairTestRepository: {
        findByUserId: async () => [
          {
            id: 101,
            hair_loss_stage: 'Stage 4 - Advanced Thinning',
            created_at: new Date('2026-11-10T10:00:00Z'),
            status: 'submitted',
            ai_assessment: {
              ai_status: 'clinician_review_required',
              requiresClinician: true,
              next_step_recommendation: {
                type: 'doctor_appointment',
                reason: 'Advanced thinning requires direct clinician review before starting care.',
              },
              available_products: [
                { id: 'prod_1', name: 'Anti-Hair Fall Serum', in_stock: true },
              ],
            },
          },
        ],
        getDraft: async () => null,
      },
      treatmentRepository: { findByUserId: async () => [] },
      clinicalReportRepository: { listSharedByUserId: async () => [] },
      appointmentRepository: { listByPatient: async () => [] },
      featureFlagRepository: {
        evaluate: async (flag) => ({ enabled: true }),
      },
    });

    const res = recorder();
    await controller.getHomeSummary({ user: { id: 42 } }, res, (err) => { throw err; });

    const cards = res.body.data.action_cards;
    assert.equal(cards.length, 1);
    assert.equal(cards[0].priority, 1);
    assert.equal(cards[0].type, 'clinician_urgent');
    assert.equal(cards[0].action_label, 'Book Clinic Visit');
    assert.equal(cards[0].destination.route, '/clinic-appointment');
    // Verify product suggestions were SUPPRESSED due to clinician priority
    assert.equal(cards.some((c) => c.type === 'product_suggestions'), false);
  });

  it('prioritizes pending assessment draft before other non-urgent cards', async () => {
    const controller = new PatientClinicalController({
      hairTestRepository: {
        findByUserId: async () => [],
        getDraft: async () => ({
          step: 2,
          formData: { age: '28', gender: 'male', concern: 'thinning' },
          updated_at: new Date('2026-11-12T08:00:00Z'),
        }),
      },
      treatmentRepository: { findByUserId: async () => [] },
      clinicalReportRepository: { listSharedByUserId: async () => [] },
      appointmentRepository: { listByPatient: async () => [] },
      featureFlagRepository: {
        evaluate: async () => ({ enabled: true }),
      },
    });

    const res = recorder();
    await controller.getHomeSummary({ user: { id: 42 } }, res, (err) => { throw err; });

    const cards = res.body.data.action_cards;
    assert.equal(cards.length, 1);
    assert.equal(cards[0].priority, 2);
    assert.equal(cards[0].type, 'pending_assessment');
    assert.equal(cards[0].action_label, 'Continue Assessment');
    assert.equal(cards[0].destination.route, '/hair-test');
  });

  it('returns newly shared admin report card and does NOT leak private reports', async () => {
    const controller = new PatientClinicalController({
      hairTestRepository: {
        findByUserId: async () => [],
        getDraft: async () => null,
      },
      treatmentRepository: { findByUserId: async () => [] },
      clinicalReportRepository: {
        listSharedByUserId: async () => [
          {
            id: 'rpt_shared_1',
            title: 'Trichology Density Analysis',
            visibility: 'Shared',
            file_name: 'density.pdf',
            bytes: 2048,
            created_at: new Date('2026-11-11T12:00:00Z'),
          },
          {
            id: 'rpt_private_2',
            title: 'Confidential Internal Review',
            visibility: 'Private',
            file_name: 'private.pdf',
            bytes: 1024,
            created_at: new Date('2026-11-12T12:00:00Z'),
          },
        ],
      },
      appointmentRepository: { listByPatient: async () => [] },
      featureFlagRepository: {
        evaluate: async () => ({ enabled: true }),
      },
    });

    const res = recorder();
    await controller.getHomeSummary({ user: { id: 42 } }, res, (err) => { throw err; });

    const cards = res.body.data.action_cards;
    assert.equal(cards.length, 1);
    assert.equal(cards[0].priority, 3);
    assert.equal(cards[0].type, 'shared_report');
    assert.equal(cards[0].entity_id, 'rpt_shared_1');
    assert.equal(cards[0].title, 'New Report from Clinic');
    assert.equal(cards.some((c) => c.entity_id === 'rpt_private_2'), false);
  });

  it('returns doctor-authored care plan as distinct from report card', async () => {
    const controller = new PatientClinicalController({
      hairTestRepository: {
        findByUserId: async () => [],
        getDraft: async () => null,
      },
      treatmentRepository: {
        findByUserId: async () => [
          {
            id: 'care_101',
            treatment_name: 'Minoxidil 5% Regimen + Scalp Tonic',
            doctor_name: 'Dr. Sharma',
            created_at: new Date('2026-11-09T10:00:00Z'),
            medications: [{ name: 'Minoxidil', dose: '1ml' }],
          },
        ],
      },
      clinicalReportRepository: {
        listSharedByUserId: async () => [
          {
            id: 'rpt_1',
            title: 'Blood Panel',
            visibility: 'Shared',
            created_at: new Date('2026-11-08T10:00:00Z'),
          },
        ],
      },
      appointmentRepository: { listByPatient: async () => [] },
      featureFlagRepository: {
        evaluate: async () => ({ enabled: true }),
      },
    });

    const res = recorder();
    await controller.getHomeSummary({ user: { id: 42 } }, res, (err) => { throw err; });

    const cards = res.body.data.action_cards;
    assert.equal(cards.length, 2);
    // Priority 3: shared report
    assert.equal(cards[0].type, 'shared_report');
    assert.equal(cards[0].priority, 3);
    // Priority 4: care plan
    assert.equal(cards[1].type, 'care_plan');
    assert.equal(cards[1].priority, 4);
    assert.equal(cards[1].title, 'Your Care Plan');
    assert.equal(cards[1].why_shown, 'Prescribed by Dr. Sharma');
  });

  it('shows product suggestions when shop is enabled, product is in stock, and clinician review is not required', async () => {
    const controller = new PatientClinicalController({
      hairTestRepository: {
        findByUserId: async () => [
          {
            id: 201,
            hair_loss_stage: 'Stage 2 - Early Thinning',
            created_at: new Date('2026-11-10T10:00:00Z'),
            status: 'reviewed',
            ai_assessment: {
              ai_status: 'available',
              requiresClinician: false,
              next_step_recommendation: {
                type: 'products',
                reason: 'Early thinning responds well to daily nourishing topical care.',
              },
              available_products: [
                { id: 'shampoo_1', name: 'Biotin Gentle Cleanser', in_stock: true, price: 499 },
              ],
            },
          },
        ],
        getDraft: async () => null,
      },
      treatmentRepository: { findByUserId: async () => [] },
      clinicalReportRepository: { listSharedByUserId: async () => [] },
      appointmentRepository: { listByPatient: async () => [] },
      featureFlagRepository: {
        evaluate: async (flag) => ({ enabled: flag === 'shop' }),
      },
    });

    const res = recorder();
    await controller.getHomeSummary({ user: { id: 42 } }, res, (err) => { throw err; });

    const cards = res.body.data.action_cards;
    assert.equal(cards.length, 1);
    assert.equal(cards[0].priority, 5);
    assert.equal(cards[0].type, 'product_suggestions');
    assert.equal(cards[0].products[0].name, 'Biotin Gentle Cleanser');
  });

  it('hides product suggestions when shop feature flag is disabled', async () => {
    const controller = new PatientClinicalController({
      hairTestRepository: {
        findByUserId: async () => [
          {
            id: 201,
            hair_loss_stage: 'Stage 2 - Early Thinning',
            created_at: new Date('2026-11-10T10:00:00Z'),
            status: 'reviewed',
            ai_assessment: {
              ai_status: 'available',
              requiresClinician: false,
              next_step_recommendation: { type: 'products' },
              available_products: [{ id: 'shampoo_1', in_stock: true }],
            },
          },
        ],
        getDraft: async () => null,
      },
      treatmentRepository: { findByUserId: async () => [] },
      clinicalReportRepository: { listSharedByUserId: async () => [] },
      appointmentRepository: { listByPatient: async () => [] },
      featureFlagRepository: {
        evaluate: async (flag) => ({ enabled: flag !== 'shop' }),
      },
    });

    const res = recorder();
    await controller.getHomeSummary({ user: { id: 42 } }, res, (err) => { throw err; });

    const cards = res.body.data.action_cards;
    assert.equal(cards.some((c) => c.type === 'product_suggestions'), false);
  });

  it('handles empty data gracefully without fabricated recommendations', async () => {
    const controller = new PatientClinicalController({
      hairTestRepository: {
        findByUserId: async () => [],
        getDraft: async () => null,
      },
      treatmentRepository: { findByUserId: async () => [] },
      clinicalReportRepository: { listSharedByUserId: async () => [] },
      appointmentRepository: { listByPatient: async () => [] },
    });

    const res = recorder();
    await controller.getHomeSummary({ user: { id: 99 } }, res, (err) => { throw err; });

    assert.equal(res.body.status, 'success');
    assert.deepEqual(res.body.data.action_cards, []);
    assert.equal(res.body.data.patient_status.has_completed_assessment, false);
    assert.equal(res.body.data.patient_status.has_active_care_plan, false);
    assert.equal(res.body.data.patient_status.shared_reports_count, 0);
  });
});
