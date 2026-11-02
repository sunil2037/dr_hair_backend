import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { store } from '../src/shared/database/store.js';

test('Delete Account API & Use Case', async (t) => {
  const container = createContainer();
  const { deleteAccountUseCase, getProfileUseCase } = container.useCases;
  const { userRepository } = container.repositories;

  // Create a test user in store
  const testUserId = 99912;
  const testUserPhone = '9999988888';
  const testUserEmail = 'delete_me@example.com';

  store.users.push({
    id: testUserId,
    name: 'Temporary User',
    email: testUserEmail,
    phone: testUserPhone,
    phoneNormalized: testUserPhone,
    patient_code: 'DH99912',
    role: 'user',
    created_at: new Date().toISOString(),
  });

  // Add an OTP, a treatment, and a clinical report for this user
  store.otps.set(testUserPhone, {
    otpHash: 'hashed_otp',
    expiresAt: new Date(Date.now() + 600000),
    type: 'login',
  });

  store.treatments.push({
    id: 8881,
    userId: testUserId,
    treatment_name: 'Minoxidil 5% Regimen',
    date: '2026-11-01',
  });

  store.clinicalReports.push({
    id: 'rep_99912',
    userId: testUserId,
    title: 'Baseline Trichoscopy Analysis',
    file_name: 'report.pdf',
    mime_type: 'application/pdf',
    format: 'pdf',
    bytes: 1024,
    public_id: 'drhair/reports/rep_99912',
  });

  await t.test('deletes user profile and OTPs, but preserves clinical reports and treatments for admin/doctor records', async () => {
    // Verify user exists before deletion
    const existing = await userRepository.findById(testUserId);
    assert.ok(existing);
    assert.equal(existing.name, 'Temporary User');

    // Execute delete account use case
    const result = await deleteAccountUseCase.execute({ userId: testUserId });
    assert.equal(result.success, true);

    // Verify user is removed
    const deletedUser = await userRepository.findById(testUserId);
    assert.equal(deletedUser, null);

    // Verify OTP was cleared
    assert.equal(store.otps.has(testUserPhone), false);

    // Verify treatments are PRESERVED
    const preservedTreatment = store.treatments.find((t) => t.userId === testUserId);
    assert.ok(preservedTreatment, 'Treatment records must remain for clinical audit');
    assert.equal(preservedTreatment.treatment_name, 'Minoxidil 5% Regimen');

    // Verify clinical reports are PRESERVED
    const preservedReport = store.clinicalReports.find((r) => r.userId === testUserId);
    assert.ok(preservedReport, 'Clinical reports must remain for doctor reference');
    assert.equal(preservedReport.title, 'Baseline Trichoscopy Analysis');
  });

  await t.test('subsequent calls to delete or get profile fail with NotFoundError', async () => {
    await assert.rejects(
      async () => {
        await getProfileUseCase.execute({ userId: testUserId });
      },
      { name: 'NotFoundError' }
    );

    await assert.rejects(
      async () => {
        await deleteAccountUseCase.execute({ userId: testUserId });
      },
      { name: 'NotFoundError' }
    );
  });
});
