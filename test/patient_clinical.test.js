import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PatientClinicalController } from '../src/modules/patient/presentation/patient-clinical.controller.js';

const recorder = () => ({
  body: null,
  statusCode: 200,
  json(body) { this.body = body; return this; },
  status(code) { this.statusCode = code; return this; },
});

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

  it('allows patients to retrieve, add, and remove personal care routine steps', async () => {
    let storedSteps = [
      { title: 'Morning Hair Tonic', subtitle: 'Apply 1ml', category: 'Clinical Topical', time_of_day: 'Morning' },
    ];
    const controller = new PatientClinicalController({
      treatmentRepository: {
        getRoutineSteps: async (userId) => storedSteps,
        addRoutineStep: async (userId, step) => {
          storedSteps.push(step);
          return storedSteps;
        },
        removeRoutineStep: async (userId, index) => {
          storedSteps.splice(index, 1);
          return storedSteps;
        },
      },
      patientActivityRepository: { record: async () => {} },
    });

    const getRes = recorder();
    await controller.getRoutineSteps({ user: { id: 42 } }, getRes, (err) => { throw err; });
    assert.equal(getRes.body.data.routine_steps.length, 1);
    assert.equal(getRes.body.data.routine_steps[0].title, 'Morning Hair Tonic');

    const addRes = recorder();
    await controller.addRoutineStep(
      {
        user: { id: 42 },
        body: {
          title: 'Scalp Dermarolling (0.5mm)',
          subtitle: 'Roll gently for 5 mins',
          category: 'Lifestyle',
          time_of_day: 'Evening',
        },
      },
      addRes,
      (err) => { throw err; },
    );
    assert.equal(addRes.statusCode, 201);
    assert.equal(addRes.body.data.routine_steps.length, 2);
    assert.equal(addRes.body.data.routine_steps[1].title, 'Scalp Dermarolling (0.5mm)');

    const deleteRes = recorder();
    await controller.deleteRoutineStep({ user: { id: 42 }, params: { stepIndex: '0' } }, deleteRes, (err) => { throw err; });
    assert.equal(deleteRes.body.data.routine_steps.length, 1);
    assert.equal(deleteRes.body.data.routine_steps[0].title, 'Scalp Dermarolling (0.5mm)');
  });

  it('allows patients to retrieve, save, and delete care reminders via API', async () => {
    let storedReminders = [
      {
        id: 'rem_1',
        title: 'Morning Supplement',
        subtitle: 'Biotin after breakfast',
        time: '09:00',
        hour: 9,
        minute: 0,
        isEnabled: true,
        frequency: 'Daily',
        treatmentType: 'Oral Supplement',
        repeatDays: [1, 2, 3, 4, 5, 6, 7],
      },
    ];

    const controller = new PatientClinicalController({
      treatmentRepository: {
        getReminders: async (userId) => storedReminders,
        saveReminder: async (userId, reminder) => {
          const idx = storedReminders.findIndex((r) => r.id === reminder.id);
          if (idx >= 0) {
            storedReminders[idx] = reminder;
          } else {
            storedReminders.push(reminder);
          }
          return storedReminders;
        },
        deleteReminder: async (userId, id) => {
          storedReminders = storedReminders.filter((r) => r.id !== id);
          return storedReminders;
        },
      },
    });

    // 1. GET /reminders
    const getRes = recorder();
    await controller.getReminders({ user: { id: 42 } }, getRes, (err) => { throw err; });
    assert.equal(getRes.body.data.reminders.length, 1);
    assert.equal(getRes.body.data.reminders[0].title, 'Morning Supplement');

    // 2. POST /reminders (Create)
    const addRes = recorder();
    await controller.saveReminder(
      {
        user: { id: 42 },
        body: {
          id: 'rem_2',
          title: 'Dr. Hair 5% Minoxidil Booster',
          subtitle: 'Topical Serum · Daily',
          time: '21:30',
          hour: 21,
          minute: 30,
          isEnabled: true,
          frequency: 'Daily',
          treatmentType: 'Topical Serum',
          repeatDays: [1, 2, 3, 4, 5, 6, 7],
          notes: 'Apply 1ml with dropper onto dry crown',
        },
      },
      addRes,
      (err) => { throw err; },
    );
    assert.equal(addRes.statusCode, 200);
    assert.equal(addRes.body.data.reminders.length, 2);
    assert.equal(addRes.body.data.reminder.title, 'Dr. Hair 5% Minoxidil Booster');

    // 3. DELETE /reminders/:reminderId
    const delRes = recorder();
    await controller.deleteReminder(
      { user: { id: 42 }, params: { reminderId: 'rem_1' } },
      delRes,
      (err) => { throw err; },
    );
    assert.equal(delRes.statusCode, 200);
    assert.equal(delRes.body.data.reminders.length, 1);
    assert.equal(delRes.body.data.reminders[0].id, 'rem_2');
  });
});
