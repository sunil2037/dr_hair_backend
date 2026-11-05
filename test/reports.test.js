import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';

test('Clinical Reports & Push Notification Automation', async (t) => {
  const container = createContainer();
  const { adminController } = container.controllers;
  const { notificationRepository, userRepository, clinicalReportRepository } = container.repositories;

  // Create a patient user
  const patient = await userRepository.create({
    name: 'Report Test Patient',
    phone: '9988776655',
    role: 'user',
  });

  let createdReportId;

  await t.test('uploads a clinical report with Private status by default', async () => {
    const report = await clinicalReportRepository.create({
      id: 'rep-test-001',
      userId: patient.id,
      title: 'Dr. Jai Bansal Trichoscopy Report',
      file_name: 'trichoscopy.pdf',
      mime_type: 'application/pdf',
      format: 'pdf',
      bytes: 2048,
      public_id: 'drhair/private-reports/user-1/rep-test-001.pdf',
      uploaded_by: 'Super Admin',
      visibility: 'Private',
      shared_at: null,
      visibility_history: [{ action: 'uploaded', visibility: 'Private', changed_by: 'Super Admin', changed_at: new Date() }],
    });

    createdReportId = report.id;
    assert.equal(report.visibility, 'Private');
    assert.equal(report.title, 'Dr. Jai Bansal Trichoscopy Report');
  });

  await t.test('listing all reports includes the created report', async () => {
    let responseData;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { responseData = body; return this; },
    };

    await adminController.listAllReports({}, res, (err) => { if (err) throw err; });
    assert.ok(responseData?.data?.reports);
    const found = responseData.data.reports.find((r) => r.id === createdReportId);
    assert.ok(found);
    assert.equal(found.title, 'Dr. Jai Bansal Trichoscopy Report');
  });

  await t.test('sharing report auto-dispatches notification to patient', async () => {
    let responseData;
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { responseData = body; return this; },
    };

    const req = {
      params: { userId: String(patient.id), reportId: createdReportId },
      body: { visibility: 'Shared', patient_consent_confirmed: true },
      user: { email: 'doctor@drhair.in' },
    };

    await adminController.updatePatientReportVisibility(req, res, (err) => { if (err) throw err; });
    assert.equal(responseData?.data?.visibility, 'Shared');

    // Verify automated notification creation
    const notifications = await notificationRepository.listByUserId(patient.id);
    const reportNotif = notifications.items.find((n) => n.type === 'report' || n.destination?.screen === 'assessment_result');
    assert.ok(reportNotif, 'Expected in-app notification to be created for shared report');
    assert.match(reportNotif.title, /report/i);
    assert.equal(reportNotif.destination.screen, 'assessment_result');
  });
});
