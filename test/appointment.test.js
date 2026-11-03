import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { store } from '../src/shared/database/store.js';

test('Appointment Booking & Payment Endpoints', async (t) => {
  const container = createContainer();
  const { appointmentController } = container.controllers;

  // Setup test user in store
  const userId = 7712;
  const user = {
    id: userId,
    name: 'Rohit Verma',
    phone: '9876540001',
    email: 'rohit@example.com',
    patient_code: 'DH7712',
    role: 'user',
  };
  store.users.push(user);

  // Helper to generate a valid future weekday slot (e.g. next Tuesday at 10:30 AM IST)
  const getFutureSlot = (daysAhead = 3, hour = '10:30:00') => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    while (d.getDay() === 0) { // skip Sunday
      d.setDate(d.getDate() + 1);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    // IST is UTC+5:30 -> 10:30 AM IST = 05:00:00 UTC
    return new Date(`${year}-${month}-${day}T${hour}+05:30`).toISOString();
  };

  const slot1 = getFutureSlot(4, '10:30:00');
  const slot2 = getFutureSlot(5, '11:00:00');

  let bookedAppointmentId = '';

  await t.test('patient attempting to set Paid status without verified gateway is rejected', async () => {
    const req = {
      user: { id: userId, role: 'user' },
      body: {
        starts_at: slot1,
        reason: 'Receding hairline consultation & scalp check',
        consultation_fee: 500,
        payment_method: 'UPI',
        payment_status: 'Paid',
        payment_transaction_id: 'UPI-TXN-99887766',
      },
    };
    const res = {
      status() { return this; },
      json() { return this; },
    };

    await assert.rejects(
      async () => {
        await appointmentController.createPatient(req, res, (err) => {
          if (err) throw err;
        });
      },
      { name: 'BadRequestError' }
    );
  });

  await t.test('patient creates in-clinic appointment with Pay at Clinic (fee ₹500, status Pending)', async () => {
    let responseData = null;
    let statusCode = null;

    const req = {
      user: { id: userId, role: 'user' },
      body: {
        starts_at: slot1,
        reason: 'Receding hairline consultation & scalp check',
        consultation_fee: 500,
        payment_method: 'Pay at clinic',
      },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await appointmentController.createPatient(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(statusCode, 201);
    assert.equal(responseData.status, 'success');
    assert.ok(responseData.data.id.startsWith('APT-'));
    assert.ok(responseData.data.opd_token.startsWith('OPD-'));
    assert.equal(responseData.data.consultationFee, 500);
    assert.equal(responseData.data.paymentStatus, 'Pending');
    assert.equal(responseData.data.paymentMethod, 'Pay at clinic');

    bookedAppointmentId = responseData.data.id;
  });

  await t.test('double booking the same slot rejects with error', async () => {
    const req = {
      user: { id: userId, role: 'user' },
      body: {
        starts_at: slot1,
        reason: 'Duplicate slot booking test',
      },
    };
    const res = {
      status() { return this; },
      json() { return this; },
    };

    await assert.rejects(
      async () => {
        await appointmentController.createPatient(req, res, (err) => {
          if (err) throw err;
        });
      },
      { name: 'BadRequestError' }
    );
  });

  await t.test('patient creates another appointment with Pay at Clinic (status Pending)', async () => {
    let responseData = null;
    let statusCode = null;

    const req = {
      user: { id: userId, role: 'user' },
      body: {
        starts_at: slot2,
        reason: 'Follow-up trichoscopy',
        consultation_fee: 500,
        payment_method: 'Cash at Clinic',
        payment_status: 'Pending',
      },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await appointmentController.createPatient(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(statusCode, 201);
    assert.equal(responseData.data.paymentStatus, 'Pending');
    assert.equal(responseData.data.paymentMethod, 'Cash at Clinic');
  });

  await t.test('admin lists appointments and sees payment metadata', async () => {
    let responseData = null;
    const req = { query: {} };
    const res = {
      status() { return this; },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await appointmentController.listAdmin(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData.status, 'success');
    const items = responseData.data.items;
    const item = items.find((i) => i.id === bookedAppointmentId);
    assert.ok(item);
    assert.equal(item.consultationFee, 500);
    assert.equal(item.paymentStatus, 'Pending');
  });

  await t.test('admin marks cash appointment as Paid and confirms it', async () => {
    let responseData = null;
    const secondApt = store.appointments.find((a) => a.starts_at === slot2);
    assert.ok(secondApt);

    const req = {
      params: { appointmentId: secondApt.id },
      user: { email: 'admin@drhair.test' },
      body: {
        status: 'Confirmed',
        payment_status: 'Paid',
      },
    };
    const res = {
      status() { return this; },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await appointmentController.updateAdmin(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData.status, 'success');
    assert.equal(responseData.data.status, 'Confirmed');
    assert.equal(responseData.data.paymentStatus, 'Paid');
  });
});
