import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { store } from '../src/shared/database/store.js';

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

test('daily care events are patient scoped, idempotent, and symptom escalation is clinic-only', async (t) => {
  const container = createContainer();
  const controller = container.controllers.patientClinicalController;
  store.patientCareEvents = [];
  t.after(() => { store.patientCareEvents = []; });

  const save = async (userId, body) => {
    let error;
    const res = createResponse();
    await controller.saveCareEvent({ user: { id: userId }, body }, res, (value) => { error = value; });
    return { res, error };
  };
  const list = async (userId) => {
    let error;
    const res = createResponse();
    await controller.listCareEvents(
      { user: { id: userId }, query: { from: '2026-11-01', to: '2026-11-30' } },
      res,
      (value) => { error = value; },
    );
    return { res, error };
  };

  const water = {
    event_date: '2026-11-13', event_type: 'water', event_key: 'daily_water',
    status: 'logged', value: 3,
  };
  await save(7, water);
  await save(7, { ...water, value: 4 });
  const patientEvents = await list(7);
  assert.equal(patientEvents.res.payload.data.items.length, 1);
  assert.equal(patientEvents.res.payload.data.items[0].value, 4);
  assert.equal((await list(8)).res.payload.data.items.length, 0);

  const symptom = await save(7, {
    event_date: '2026-11-13', event_type: 'symptom', event_key: 'symptom_today',
    status: 'logged', severity: 'moderate', symptoms: ['pain'], note: 'It hurts when touched.',
  });
  assert.equal(symptom.res.payload.data.clinician_contact_recommended, true);
  assert.equal(symptom.res.payload.data.next_step, 'contact_clinic');

  const safe = await save(7, {
    event_date: '2026-11-13', event_type: 'symptom', event_key: 'symptom_itch',
    status: 'logged', severity: 'mild', symptoms: ['itching'], note: '',
  });
  assert.equal(safe.res.payload.data.clinician_contact_recommended, false);

  const skipped = await save(7, {
    event_date: '2026-11-13', event_type: 'routine', event_key: 'routine_1',
    status: 'skipped', note: 'Was travelling',
  });
  assert.equal(skipped.res.payload.data.item.status, 'skipped');
  assert.equal(skipped.res.payload.data.item.note, 'Was travelling');
});

test('daily care event API rejects invalid dates, water counts, and unsupported symptoms', async () => {
  const controller = createContainer().controllers.patientClinicalController;
  const call = async (body) => {
    let error;
    const res = createResponse();
    await controller.saveCareEvent({ user: { id: 1 }, body }, res, (value) => { error = value; });
    return { res, error };
  };
  const base = { event_date: '2026-11-13', event_key: 'test_key' };
  assert.match((await call({ ...base, event_date: '2026-02-31', event_type: 'water', status: 'logged', value: 2 })).error.message, /valid YYYY-MM-DD/);
  assert.match((await call({ ...base, event_type: 'water', status: 'logged', value: 21 })).error.message, /0 to 20/);
  assert.match((await call({ ...base, event_type: 'symptom', status: 'logged', severity: 'mild', symptoms: ['diagnosed_condition'] })).error.message, /supported symptom labels/);
});
