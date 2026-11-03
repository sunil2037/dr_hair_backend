import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { store } from '../src/shared/database/store.js';
import { BadRequestError, NotFoundError } from '../src/shared/errors/index.js';

const mockResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.body = data;
    return this;
  },
});

test('Phase 2 - Patient Clinical Vertical Slice', async (t) => {
  const container = createContainer();
  const { patientClinicalController, adminController } = container.controllers;
  const { hairTestRepository, clinicalReportRepository, progressCheckInRepository } = container.repositories;

  const patientA = { id: 801, name: 'Patient A', role: 'user' };
  const patientB = { id: 802, name: 'Patient B', role: 'user' };

  if (!store.users.some((u) => u.id === patientA.id)) {
    store.users.push({ ...patientA, phone: '9999988881', email: 'patientA@example.com' });
  }
  if (!store.users.some((u) => u.id === patientB.id)) {
    store.users.push({ ...patientB, phone: '9999988882', email: 'patientB@example.com' });
  }

  await t.test('Assessment draft save, retrieve, and delete', async () => {
    // 1. Save draft for Patient A
    const saveReq = {
      user: { id: patientA.id, role: 'user' },
      body: {
        step: 2,
        formData: {
          primary_concern: 'Receding hairline',
          duration: '6 months',
          dandruff: 'Mild',
        },
      },
    };
    const saveRes = mockResponse();
    await patientClinicalController.saveAssessmentDraft(saveReq, saveRes, (err) => {
      if (err) throw err;
    });

    assert.equal(saveRes.statusCode, 200);
    assert.equal(saveRes.body.data.draft.step, 2);
    assert.equal(saveRes.body.data.draft.formData.primary_concern, 'Receding hairline');

    // 2. Retrieve draft for Patient A
    const getResA = mockResponse();
    await patientClinicalController.getAssessmentDraft({ user: { id: patientA.id } }, getResA, (err) => {
      if (err) throw err;
    });

    assert.equal(getResA.statusCode, 200);
    assert.equal(getResA.body.data.draft.step, 2);
    assert.equal(getResA.body.data.draft.formData.primary_concern, 'Receding hairline');

    // 3. Patient B has no draft (isolated)
    const getResB = mockResponse();
    await patientClinicalController.getAssessmentDraft({ user: { id: patientB.id } }, getResB, (err) => {
      if (err) throw err;
    });

    assert.equal(getResB.statusCode, 200);
    assert.equal(getResB.body.data.draft, null);

    // 4. Delete draft for Patient A
    const delResA = mockResponse();
    await patientClinicalController.deleteAssessmentDraft({ user: { id: patientA.id } }, delResA, (err) => {
      if (err) throw err;
    });
    assert.equal(delResA.statusCode, 200);

    const getResA2 = mockResponse();
    await patientClinicalController.getAssessmentDraft({ user: { id: patientA.id } }, getResA2, (err) => {
      if (err) throw err;
    });
    assert.equal(getResA2.body.data.draft, null);
  });

  await t.test('Assessment State Machine: transitions and validations', async () => {
    const created = await hairTestRepository.create({
      userId: patientA.id,
      full_name: 'Patient A',
      main_concern: 'Crown thinning',
      hair_loss_stage: 'Stage 2',
    });

    assert.ok(created.reference_no);
    assert.equal(created.status, 'submitted');
    assert.equal(created.status_history.length, 1);
    assert.equal(created.status_history[0].status, 'submitted');

    // Valid transition: submitted -> under_review
    const underReview = await hairTestRepository.updateStatus(created.reference_no, 'under_review', {
      changed_by: 'Doctor Dave',
      note: 'Clinician began assessment review',
    });
    assert.equal(underReview.status, 'under_review');
    assert.equal(underReview.status_history.length, 2);
    assert.equal(underReview.status_history[1].status, 'under_review');
    assert.equal(underReview.status_history[1].changed_by, 'Doctor Dave');

    // Valid transition: under_review -> reviewed
    const reviewed = await hairTestRepository.updateStatus(created.reference_no, 'reviewed', {
      changed_by: 'Doctor Dave',
      note: 'Care plan created and reviewed',
    });
    assert.equal(reviewed.status, 'reviewed');
    assert.equal(reviewed.status_history.length, 3);

    // Invalid transition: reviewed -> submitted (rejected)
    await assert.rejects(
      async () => {
        await hairTestRepository.updateStatus(created.reference_no, 'submitted', {
          changed_by: 'Patient',
        });
      },
      (err) => err instanceof BadRequestError && err.message.includes('Cannot transition assessment status'),
    );

    // Valid transition: reviewed -> archived
    const archived = await hairTestRepository.updateStatus(created.reference_no, 'archived', {
      changed_by: 'System',
      note: 'Superseded by new test',
    });
    assert.equal(archived.status, 'archived');

    // Invalid transition: archived -> under_review
    await assert.rejects(
      async () => {
        await hairTestRepository.updateStatus(created.reference_no, 'under_review');
      },
      (err) => err instanceof BadRequestError,
    );
  });

  await t.test('Clinician Treatment creation updates assessment to reviewed', async () => {
    const assessment = await hairTestRepository.create({
      userId: patientA.id,
      full_name: 'Patient A',
      main_concern: 'Scalp irritation',
      hair_loss_stage: 'Stage 1',
    });
    assert.equal(assessment.status, 'submitted');

    const req = {
      body: {
        reference_no: assessment.reference_no,
        treatment_name: 'Anti-DHT Scalp Therapy',
        doctor_name: 'Dr. Hair Clinical Lead',
        medications: [
          {
            name: 'Procapil 3% Serum',
            dose: '1ml',
            frequency: 'Once daily at bedtime',
          },
        ],
        routine_steps: [
          {
            title: 'Apply serum',
            subtitle: 'Apply 1ml with dropper',
            category: 'Clinical Topical',
            time_of_day: 'Evening',
          },
        ],
        diet_meals: [],
      },
      user: { email: 'admin@drhair.test', role: 'admin' },
    };
    const res = mockResponse();

    await adminController.createTreatment(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(res.statusCode, 201);
    const updatedTest = await hairTestRepository.findByReferenceNo(assessment.reference_no);
    assert.equal(updatedTest.status, 'reviewed');
    assert.ok(updatedTest.status_history.some((h) => h.status === 'reviewed'));
  });

  await t.test('Progress check-in deletion and ownership protection', async () => {
    const checkInA = await progressCheckInRepository.createOnce({
      id: 'checkin-pat-a-1',
      userId: patientA.id,
      date: new Date(),
      scalp_region: 'Crown',
      shedding_level: 'Mild',
      notes: 'Day 30 progress photo',
      density_rating: 4,
      photos: [
        {
          angle: 'front',
          public_id: `drhair/images/user-${patientA.id}/progress/front_sample`,
          url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          delivery_type: 'authenticated',
          format: 'jpg',
          bytes: 12000,
        },
      ],
    });
    assert.ok(checkInA);

    // Patient B cannot delete Patient A's checkin (returns 404)
    let caughtB = null;
    await patientClinicalController.deleteProgressCheckIn(
      { user: { id: patientB.id }, params: { checkInId: 'checkin-pat-a-1' } },
      mockResponse(),
      (err) => { caughtB = err; },
    );
    assert.ok(caughtB instanceof NotFoundError);

    // Patient A can delete own checkin
    const delResA = mockResponse();
    await patientClinicalController.deleteProgressCheckIn(
      { user: { id: patientA.id }, params: { checkInId: 'checkin-pat-a-1' } },
      delResA,
      (err) => { if (err) throw err; },
    );
    assert.equal(delResA.statusCode, 200);
    assert.equal(delResA.body.message, 'Progress check-in removed from clinical record.');

    // Confirm it is gone
    const after = await progressCheckInRepository.findById(patientA.id, 'checkin-pat-a-1');
    assert.equal(after, null);
  });

  await t.test('Clinical report privacy and download authorization', async () => {
    const privateReport = await clinicalReportRepository.create({
      id: 'report-priv-1',
      userId: patientA.id,
      title: 'Confidential Biopsy Findings',
      file_name: 'biopsy.pdf',
      mime_type: 'application/pdf',
      format: 'pdf',
      bytes: 25000,
      public_id: 'drhair/reports/biopsy_1',
      visibility: 'Private',
      created_by: 'Doctor Dave',
    });

    const sharedReport = await clinicalReportRepository.create({
      id: 'report-share-1',
      userId: patientA.id,
      title: 'Monthly Scalp Assessment',
      file_name: 'scalp_jan.pdf',
      mime_type: 'application/pdf',
      format: 'pdf',
      bytes: 35000,
      public_id: 'drhair/reports/scalp_jan',
      visibility: 'Shared',
      created_by: 'Doctor Dave',
    });

    // Patient A calls getClinicalRecord: only shared report is returned
    const recordRes = mockResponse();
    await patientClinicalController.getClinicalRecord(
      { user: { id: patientA.id } },
      recordRes,
      (err) => { if (err) throw err; },
    );

    assert.equal(recordRes.statusCode, 200);
    const reports = recordRes.body.data.reports;
    assert.ok(reports.some((r) => r.id === sharedReport.id));
    assert.ok(!reports.some((r) => r.id === privateReport.id));

    // Patient A cannot download private report (returns 404)
    let caughtPrivate = null;
    await patientClinicalController.downloadReport(
      { user: { id: patientA.id }, params: { reportId: privateReport.id } },
      mockResponse(),
      (err) => { caughtPrivate = err; },
    );
    assert.ok(caughtPrivate instanceof NotFoundError);

    // Patient A can download shared report (returns signed download URL)
    const downloadSharedRes = mockResponse();
    await patientClinicalController.downloadReport(
      { user: { id: patientA.id }, params: { reportId: sharedReport.id } },
      downloadSharedRes,
      (err) => { if (err) throw err; },
    );
    assert.equal(downloadSharedRes.statusCode, 200);
    assert.ok(downloadSharedRes.body.data.url);
    assert.equal(downloadSharedRes.body.data.expires_in_seconds, 60);

    // Patient B cannot download Patient A's shared report (returns 404)
    let caughtForeign = null;
    await patientClinicalController.downloadReport(
      { user: { id: patientB.id }, params: { reportId: sharedReport.id } },
      mockResponse(),
      (err) => { caughtForeign = err; },
    );
    assert.ok(caughtForeign instanceof NotFoundError);
  });
});
