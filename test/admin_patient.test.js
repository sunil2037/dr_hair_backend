import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdminController } from '../src/modules/admin/presentation/admin.controller.js';

const invoke = async (handler, req) => {
  let statusCode = 200;
  let body;
  let error;
  const res = { status(code) { statusCode = code; return this; }, json(payload) { body = payload; return this; } };
  await handler(req, res, (nextError) => { error = nextError; });
  return { statusCode, body, error };
};

describe('Admin patient record', () => {
  const patient = {
    id: 42, role: 'user', name: 'Test Patient', email: 'patient@example.test', phone: '+91 9000000042',
    age: 34, gender: 'Female', city: 'Pune', occupation: 'Designer', profile_url: null,
    created_at: '2026-08-01T12:00:00.000Z',
    toPublicProfile() { return { id: this.id, name: this.name, email: this.email, phone: this.phone, age: this.age, gender: this.gender, city: this.city, occupation: this.occupation, profile_url: this.profile_url }; },
  };

  it('returns only the selected patient’s assessments, treatments, and safe report metadata', async () => {
    const controller = new AdminController({
      userRepository: { findById: async (id) => Number(id) === 42 ? patient : null },
      hairTestRepository: { findByUserId: async () => [{ id: 501, reference_no: 'HT-TEST-0501', hair_loss_stage: 'Stage 2', userId: 42 }] },
      treatmentRepository: { findByTestIdentifier: async () => [{ reference_no: 'HT-TEST-0501', toResponse: () => ({ id: 1, treatment_name: 'Routine', duration: '8 weeks' }) }] },
      clinicalReportRepository: {
        listByUserId: async () => [{ id: 'report-id', userId: 42, title: 'Lab report', file_name: 'lab.pdf', mime_type: 'application/pdf', format: 'pdf', bytes: 512, public_id: 'private/path/secret.pdf', asset_id: 'private-asset', uploaded_by: 'doctor@example.test', created_at: '2026-08-02T12:00:00.000Z' }],
        listArchivedByUserId: async () => [],
      },
      appointmentRepository: { listByPatient: async () => [] },
      patientActivityRepository: { listByPatient: async () => [], record: async () => {} },
      progressCheckInRepository: { listByUserId: async () => [] },
      imageStorage: { createPrivateDownloadUrl: () => 'https://example.com/dl' },
    });
    const result = await invoke(controller.getPatient, { params: { userId: '42' } });
    assert.equal(result.error, undefined);
    assert.equal(result.body.data.patient.id, 42);
    assert.equal(result.body.data.assessments[0].reference_no, 'HT-TEST-0501');
    assert.equal(result.body.data.treatments[0].reference_no, 'HT-TEST-0501');
    assert.equal(result.body.data.reports[0].title, 'Lab report');
    assert.equal('public_id' in result.body.data.reports[0], false);
    assert.equal('asset_id' in result.body.data.reports[0], false);
  });

  it('updates app-editable fields but blocks email and phone changes', async () => {
    let saved;
    const controller = new AdminController({
      userRepository: { findById: async () => patient, update: async (_id, fields) => { saved = fields; return { toPublicProfile: () => ({ ...patient.toPublicProfile(), ...fields }) }; } },
    });
    const good = await invoke(controller.updatePatient, { params: { userId: '42' }, body: { age: 35, city: 'Jaipur' } });
    assert.equal(good.error, undefined);
    assert.deepEqual(saved, { age: 35, city: 'Jaipur' });
    const bad = await invoke(controller.updatePatient, { params: { userId: '42' }, body: { phone: '9000000000' } });
    assert.equal(bad.error?.statusCode, 400);
  });

  it('does not upload a report whose file contents do not match its claimed type', async () => {
    const controller = new AdminController({
      userRepository: { findById: async () => patient },
      clinicalReportRepository: { create: async () => ({}) },
    });
    const result = await invoke(controller.uploadPatientReport, {
      params: { userId: '42' }, body: { title: 'Synthetic report' },
      file: { originalname: 'report.pdf', mimetype: 'application/pdf', size: 6, buffer: Buffer.from('not pdf') },
      user: { email: 'doctor@example.test' },
    });
    assert.equal(result.error?.statusCode, 400);
  });
});
