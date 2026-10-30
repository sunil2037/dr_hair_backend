import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PatientClinicalController } from '../src/modules/patient/presentation/patient-clinical.controller.js';

const recorder = () => ({ body: null, json(body) { this.body = body; return this; }, status() { return this; } });

describe('Patient clinical record APIs', () => {
  it('returns only the authenticated patient’s assessments, care plans, and report metadata', async () => {
    const requestedIds = [];
    const controller = new PatientClinicalController({
      hairTestRepository: { findByUserId: async (id) => { requestedIds.push(id); return [{ id: 5, duration: '6 months' }]; } },
      treatmentRepository: { findByUserId: async (id) => { requestedIds.push(id); return [{ reference_no: 'HT-1', toResponse: () => ({ medications: [], routine_steps: [] }) }]; } },
      clinicalReportRepository: { listByUserId: async (id) => { requestedIds.push(id); return [{ id: 'report-1', title: 'Lab results', public_id: 'private/secret', bytes: 15 }]; } },
    });
    const res = recorder();

    await controller.getClinicalRecord({ user: { id: 42 }, params: {} }, res, (error) => { throw error; });

    assert.deepEqual(requestedIds, [42, 42, 42]);
    assert.equal(res.body.data.assessments[0].duration, '6 months');
    assert.equal(res.body.data.care_plans[0].reference_no, 'HT-1');
    assert.equal(res.body.data.reports[0].id, 'report-1');
    assert.equal('public_id' in res.body.data.reports[0], false);
  });

  it('scopes signed report downloads to the authenticated patient', async () => {
    let lookup;
    const controller = new PatientClinicalController({
      clinicalReportRepository: { findByUserIdAndId: async (userId, reportId) => { lookup = { userId, reportId }; return null; } },
    });
    let error;

    await controller.downloadReport({ user: { id: 42 }, params: { reportId: 'report-2' } }, recorder(), (caught) => { error = caught; });

    assert.deepEqual(lookup, { userId: 42, reportId: 'report-2' });
    assert.equal(error?.statusCode, 404);
  });
});
