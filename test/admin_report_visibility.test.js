import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdminController } from '../src/modules/admin/presentation/admin.controller.js';

const recorder = () => ({
  body: null,
  statusCode: 200,
  json(body) { this.body = body; return this; },
  status(code) { this.statusCode = code; return this; },
});

describe('Admin Report Visibility & Consent Enforcement', () => {
  it('rejects sharing a report if patient_consent_confirmed is not true', async () => {
    const controller = new AdminController({
      userRepository: { findById: async () => ({ id: 42, role: 'user', patient_code: 'DHP0042' }) },
      clinicalReportRepository: { updateVisibility: async () => assert.fail('Should not reach repo') },
      patientActivityRepository: { record: async () => {} },
    });

    let error;
    await controller.updatePatientReportVisibility(
      {
        params: { userId: '42', reportId: 'rpt_1' },
        body: { visibility: 'Shared' }, // missing consent
        user: { email: 'admin@clinic.com' },
      },
      recorder(),
      (err) => { error = err; }
    );

    assert.equal(error?.statusCode, 400);
    assert.match(error?.message, /Confirm that the patient agreed/);
  });

  it('rejects sharing a report if patient_consent_confirmed is false', async () => {
    const controller = new AdminController({
      userRepository: { findById: async () => ({ id: 42, role: 'user', patient_code: 'DHP0042' }) },
      clinicalReportRepository: { updateVisibility: async () => assert.fail('Should not reach repo') },
      patientActivityRepository: { record: async () => {} },
    });

    let error;
    await controller.updatePatientReportVisibility(
      {
        params: { userId: '42', reportId: 'rpt_1' },
        body: { visibility: 'Shared', patient_consent_confirmed: false },
        user: { email: 'admin@clinic.com' },
      },
      recorder(),
      (err) => { error = err; }
    );

    assert.equal(error?.statusCode, 400);
    assert.match(error?.message, /Confirm that the patient agreed/);
  });

  it('successfully shares report when consent is confirmed and records audit and notification', async () => {
    let repoCall;
    let activityRecord;
    let notifCreated;

    const controller = new AdminController({
      userRepository: { findById: async () => ({ id: 42, role: 'user', patient_code: 'DHP0042' }) },
      clinicalReportRepository: {
        updateVisibility: async (userId, reportId, visibility, changedBy, consent) => {
          repoCall = { userId, reportId, visibility, changedBy, consent };
          return {
            id: reportId,
            userId,
            title: 'Scalp Biopsy Report',
            file_name: 'biopsy.pdf',
            mime_type: 'application/pdf',
            bytes: 4096,
            visibility: 'Shared',
            shared_at: new Date(),
            visibility_history: [{ action: 'shared', visibility: 'Shared', patient_consent_confirmed: true }],
          };
        },
      },
      patientActivityRepository: {
        record: async (act) => { activityRecord = act; },
      },
      notificationRepository: {
        create: async (notif) => { notifCreated = notif; return { ...notif, id: 'ntf_1' }; },
      },
    });

    const res = recorder();
    await controller.updatePatientReportVisibility(
      {
        params: { userId: '42', reportId: 'rpt_1' },
        body: { visibility: 'Shared', patient_consent_confirmed: true },
        user: { email: 'doctor@clinic.com' },
      },
      res,
      (err) => { throw err; }
    );

    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.visibility, 'Shared');
    assert.deepEqual(repoCall, {
      userId: 42,
      reportId: 'rpt_1',
      visibility: 'Shared',
      changedBy: 'doctor@clinic.com',
      consent: true,
    });
    assert.equal(activityRecord?.type, 'report');
    assert.equal(activityRecord?.title, 'Report shared with patient');
    assert.equal(notifCreated?.userId, 42);
    assert.equal(notifCreated?.type, 'report');
  });

  it('allows hiding a shared report back to Private without consent requirement', async () => {
    let repoCall;
    const controller = new AdminController({
      userRepository: { findById: async () => ({ id: 42, role: 'user', patient_code: 'DHP0042' }) },
      clinicalReportRepository: {
        updateVisibility: async (userId, reportId, visibility, changedBy, consent) => {
          repoCall = { userId, reportId, visibility, changedBy, consent };
          return {
            id: reportId,
            userId,
            title: 'Scalp Biopsy Report',
            file_name: 'biopsy.pdf',
            mime_type: 'application/pdf',
            bytes: 4096,
            visibility: 'Private',
            shared_at: null,
            visibility_history: [{ action: 'hidden', visibility: 'Private' }],
          };
        },
      },
      patientActivityRepository: { record: async () => {} },
    });

    const res = recorder();
    await controller.updatePatientReportVisibility(
      {
        params: { userId: '42', reportId: 'rpt_1' },
        body: { visibility: 'Private' },
        user: { email: 'doctor@clinic.com' },
      },
      res,
      (err) => { throw err; }
    );

    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.visibility, 'Private');
    assert.equal(repoCall.visibility, 'Private');
    assert.equal(repoCall.consent, false);
  });
});
