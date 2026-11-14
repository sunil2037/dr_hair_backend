import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createContainer } from '../src/container.js';
import { ConflictError } from '../src/shared/errors/index.js';

const createMockRes = () => {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
};

test('Appointment Razorpay Billing & Admin Received Payments', async (t) => {
  const container = createContainer();
  const { appointmentController, adminController } = container.controllers;
  const { userRepository } = container.repositories;
  const { paymentGatewayService } = container.services;

  if (!paymentGatewayService.keyId) paymentGatewayService.keyId = 'rzp_test_mock_123';
  if (!paymentGatewayService.keySecret) paymentGatewayService.keySecret = 'mock_secret_key_456';

  let verifiedOrder = null;
  paymentGatewayService.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    let body = {};
    try { body = JSON.parse(options.body || '{}'); } catch (_) {}
    let payload;
    if (url.endsWith('/orders') && method === 'POST') {
      payload = { id: 'order_rzp_mock_unit_123', amount: body.amount, currency: body.currency, status: 'created', notes: body.notes };
    } else if (url.endsWith('/orders/order_test_apt_999')) {
      payload = verifiedOrder;
    } else if (url.endsWith('/payments/pay_test_apt_888/capture')) {
      payload = { id: 'pay_test_apt_888', order_id: 'order_test_apt_999', amount: 65000, currency: 'INR', status: 'captured' };
    } else if (url.endsWith('/payments/pay_test_apt_888')) {
      payload = { id: 'pay_test_apt_888', order_id: 'order_test_apt_999', amount: 65000, currency: 'INR', status: 'authorized' };
    } else if (url.endsWith('/payments/pay_test_uncaptured')) {
      payload = { id: 'pay_test_uncaptured', order_id: 'order_test_apt_999', amount: 65000, currency: 'INR', status: 'failed' };
    } else {
      return { ok: false, json: async () => ({ error: 'unexpected mocked provider request' }) };
    }
    return { ok: true, json: async () => payload };
  };

  const patient = await userRepository.create({
    phone: '9876543210',
    name: 'Razorpay Test Patient',
    email: 'rzp.patient@example.com',
    role: 'user',
  });

  await t.test('1. Reads default appointment billing settings (Free by default, fee ₹500)', async () => {
    const res = createMockRes();
    await appointmentController.getBillingConfigPatient({}, res, (err) => { if (err) throw err; });
    assert.equal(res.data.data.payment_required, false);
    assert.equal(res.data.data.consultation_fee, 500);
  });

  await t.test('2. Admin updates appointment billing to require payment (ON) and fee to ₹650', async () => {
    const req = {
      user: { email: 'admin@drhair.com', role: 'super-admin' },
      body: {
        payment_required: true,
        consultation_fee: 650,
      },
    };
    const res = createMockRes();
    await appointmentController.updateBillingConfigAdmin(req, res, (err) => { if (err) throw err; });
    assert.equal(res.data.data.payment_required, true);
    assert.equal(res.data.data.consultation_fee, 650);

    const patientRes = createMockRes();
    await appointmentController.getBillingConfigPatient({}, patientRes, () => {});
    assert.equal(patientRes.data.data.payment_required, true);
    assert.equal(patientRes.data.data.consultation_fee, 650);
  });

  await t.test('3. Patient cannot book directly without payment when payment_required is true', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + ((1 + 7 - futureDate.getDay()) % 7 || 7));
    futureDate.setHours(10, 0, 0, 0);

    const req = {
      user: { id: patient.id },
      body: {
        starts_at: futureDate.toISOString(),
        reason: 'Severe scalp itching',
      },
    };

    let errorThrown = null;
    const res = createMockRes();
    await appointmentController.createPatient(req, res, (err) => { errorThrown = err; });
    assert.ok(errorThrown);
    assert.match(errorThrown.message, /Online payment is required/i);
  });

  await t.test('4. Patient creates Razorpay payment intent for appointment', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + ((1 + 7 - futureDate.getDay()) % 7 || 7));
    futureDate.setHours(10, 30, 0, 0);

    const req = {
      user: { id: patient.id },
      body: {
        starts_at: futureDate.toISOString(),
      },
    };
    const res = createMockRes();
    await appointmentController.createPaymentIntent(req, res, (err) => { if (err) throw err; });
    assert.ok(res.data.data.orderId);
    assert.equal(res.data.data.amount, 65000);
    assert.equal(res.data.data.amountFormatted, 650);
    assert.equal(res.data.data.currency, 'INR');
  });

  await t.test('5. Patient verifies signature and books appointment via verifyAndBook', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + ((1 + 7 - futureDate.getDay()) % 7 || 7));
    futureDate.setHours(11, 0, 0, 0);

    const razorpay_order_id = 'order_test_apt_999';
    const razorpay_payment_id = 'pay_test_apt_888';
    verifiedOrder = {
      id: razorpay_order_id,
      amount: 65000,
      currency: 'INR',
      status: 'created',
      notes: {
        app_order_id: `APT-123-${patient.id}-deadbeef`,
        patient_id: String(patient.id),
        starts_at: futureDate.toISOString(),
        consultation_fee: '650',
      },
    };
    const keySecret = paymentGatewayService.keySecret;
    const razorpay_signature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const req = {
      user: { id: patient.id },
      body: {
        starts_at: futureDate.toISOString(),
        reason: 'Follicular assessment',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
    };
    const res = createMockRes();
    await appointmentController.verifyAndBook(req, res, (err) => { if (err) throw err; });
    assert.equal(res.data.data.status, 'Confirmed');
    assert.equal(res.data.data.paymentStatus, 'Paid');
    assert.equal(res.data.data.paymentMethod, 'Razorpay');
    assert.equal(res.data.data.paymentTransactionId, razorpay_payment_id);
    assert.equal(res.data.data.consultationFee, 650);
    assert.ok(res.data.data.tokenNumber);

    const retryRes = createMockRes();
    await appointmentController.verifyAndBook(req, retryRes, (err) => { if (err) throw err; });
    assert.equal(retryRes.data.data.id, res.data.data.id);
    assert.equal((await container.repositories.appointmentRepository.listByPatient(patient.id)).length, 1);

    verifiedOrder.notes.patient_id = String(patient.id + 999);
    const mismatchedPaymentId = 'pay_test_wrong_patient';
    const mismatchedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${mismatchedPaymentId}`)
      .digest('hex');
    let mismatchError = null;
    await appointmentController.verifyAndBook({
      user: { id: patient.id },
      body: { ...req.body, razorpay_payment_id: mismatchedPaymentId, razorpay_signature: mismatchedSignature },
    }, createMockRes(), (err) => { mismatchError = err; });
    assert.match(mismatchError?.message || '', /does not match this patient/i);
    verifiedOrder.notes.patient_id = String(patient.id);

    verifiedOrder.amount = 100;
    const wrongAmountId = 'pay_test_wrong_amount';
    const wrongAmountSignature = crypto.createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${wrongAmountId}`).digest('hex');
    let amountError = null;
    await appointmentController.verifyAndBook({
      user: { id: patient.id },
      body: { ...req.body, razorpay_payment_id: wrongAmountId, razorpay_signature: wrongAmountSignature },
    }, createMockRes(), (err) => { amountError = err; });
    assert.match(amountError?.message || '', /consultation fee/i);
    verifiedOrder.amount = 65000;

    const uncapturedId = 'pay_test_uncaptured';
    const uncapturedStartsAt = new Date(new Date(futureDate).getTime() + 30 * 60 * 1000).toISOString();
    verifiedOrder.notes.starts_at = uncapturedStartsAt;
    const uncapturedSignature = crypto.createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${uncapturedId}`).digest('hex');
    let captureError = null;
    await appointmentController.verifyAndBook({
      user: { id: patient.id },
      body: { ...req.body, starts_at: uncapturedStartsAt, razorpay_payment_id: uncapturedId, razorpay_signature: uncapturedSignature },
    }, createMockRes(), (err) => { captureError = err; });
    assert.match(captureError?.message || '', /not captured/i);
    assert.equal((await container.repositories.appointmentRepository.listByPatient(patient.id)).length, 1);
  });

  await t.test('6. Admin listReceivedPayments returns aggregated payments and metrics', async () => {
    const req = {
      query: { page: '1', limit: '20' },
    };
    const res = createMockRes();
    await adminController.listReceivedPayments(req, res, (err) => { if (err) throw err; });
    assert.ok(res.data.data.items.length >= 1);
    const aptPayment = res.data.data.items.find((p) => p.type === 'Appointment' && p.transaction_id === 'pay_test_apt_888');
    assert.ok(aptPayment);
    assert.equal(aptPayment.amount, 650);
    assert.equal(aptPayment.status, 'Paid');
    assert.equal(aptPayment.transaction_id, 'pay_test_apt_888');
    assert.ok(res.data.data.summary.total_collected >= 650);
    assert.ok(res.data.data.summary.appointment_revenue >= 650);
    assert.ok(res.data.data.summary.paid_count >= 1);
  });

  await t.test('7. Admin enables first_appointment_free and new patient books for ₹0', async () => {
    const newPatient = await userRepository.create({
      phone: '9876500001',
      name: 'First Time Patient',
      email: 'new.patient@example.com',
      role: 'user',
    });

    // Update billing: payment required ON, but first appointment free ON
    await appointmentController.updateBillingConfigAdmin({
      user: { email: 'admin@drhair.com', role: 'super-admin' },
      body: { payment_required: true, consultation_fee: 500, first_appointment_free: true },
    }, createMockRes(), (err) => { if (err) throw err; });

    // Check patient billing config: should show first appointment free
    const patientConfigRes = createMockRes();
    await appointmentController.getBillingConfigPatient({ user: { id: newPatient.id } }, patientConfigRes, () => {});
    assert.equal(patientConfigRes.data.data.first_appointment_free, true);
    assert.equal(patientConfigRes.data.data.is_first_appointment, true);
    assert.equal(patientConfigRes.data.data.effective_fee, 0);
    assert.equal(patientConfigRes.data.data.effective_payment_required, false);

    // New patient books directly for free
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + ((1 + 7 - futureDate.getDay()) % 7 || 7));
    futureDate.setHours(11, 30, 0, 0);

    const bookRes = createMockRes();
    await appointmentController.createPatient({
      user: { id: newPatient.id },
      body: {
        starts_at: futureDate.toISOString(),
        reason: 'First consultation for hair thinning',
      },
    }, bookRes, (err) => { if (err) throw err; });

    assert.equal(bookRes.data.data.consultationFee, 0);
    assert.equal(bookRes.data.data.paymentMethod, 'Free First Consultation');
    assert.equal(bookRes.data.data.paymentStatus, 'Waived');
  });

  await t.test('8. Admin turns off payment_required (payment disabled) and allows direct booking', async () => {
    const regularPatient = await userRepository.create({
      phone: '9876500002',
      name: 'Regular Patient',
      email: 'reg.patient@example.com',
      role: 'user',
    });

    await appointmentController.updateBillingConfigAdmin({
      user: { email: 'admin@drhair.com', role: 'super-admin' },
      body: { payment_required: false, consultation_fee: 400, first_appointment_free: false },
    }, createMockRes(), (err) => { if (err) throw err; });

    const patientConfigRes = createMockRes();
    await appointmentController.getBillingConfigPatient({ user: { id: regularPatient.id } }, patientConfigRes, () => {});
    assert.equal(patientConfigRes.data.data.payment_required, false);
    assert.equal(patientConfigRes.data.data.effective_payment_required, false);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + ((2 + 7 - futureDate.getDay()) % 7 || 7));
    futureDate.setHours(12, 0, 0, 0);

    const bookRes = createMockRes();
    await appointmentController.createPatient({
      user: { id: regularPatient.id },
      body: {
        starts_at: futureDate.toISOString(),
        reason: 'Routine scalp checkup',
        payment_method: 'Pay at clinic',
      },
    }, bookRes, (err) => { if (err) throw err; });

    assert.equal(bookRes.data.data.consultationFee, 400);
    assert.equal(bookRes.data.data.paymentMethod, 'Pay at clinic');
    assert.equal(bookRes.data.data.paymentStatus, 'Pending');
  });
});

test('a slot conflict after a captured appointment payment starts a full refund', async () => {
  const container = createContainer();
  const { appointmentController } = container.controllers;
  const { userRepository, appointmentRepository } = container.repositories;
  const gateway = container.services.paymentGatewayService;
  gateway.keyId = 'rzp_test_refund';
  gateway.keySecret = 'refund_test_secret';
  const patient = await userRepository.create({
    phone: '9876500999', name: 'Slot Race Patient', email: 'slot.race@example.com', role: 'user',
  });
  await appointmentController.updateBillingConfigAdmin({
    user: { email: 'admin@drhair.com', role: 'super-admin' },
    body: { payment_required: true, consultation_fee: 650 },
  }, createMockRes(), (error) => { if (error) throw error; });

  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const paymentId = 'pay_slot_race_captured';
  const orderId = 'order_slot_race_captured';
  gateway.fetch = async (url, options = {}) => {
    const isRefund = url.endsWith(`/payments/${paymentId}/refund`) && options.method === 'POST';
    const data = isRefund
      ? { id: 'rfnd_slot_race', status: 'pending' }
      : url.endsWith(`/orders/${orderId}`)
        ? {
            id: orderId, amount: 65000, currency: 'INR',
            notes: {
              app_order_id: `APT-123-${patient.id}-1234abcd`,
              patient_id: String(patient.id), starts_at: startsAt, consultation_fee: '650',
            },
          }
        : { id: paymentId, order_id: orderId, amount: 65000, currency: 'INR', status: 'captured' };
    return { ok: true, json: async () => data };
  };
  appointmentController.validateSlot = async () => {};
  appointmentRepository.create = async () => {
    throw new ConflictError('This clinic slot has just been booked. Choose another time.');
  };

  const signature = crypto.createHmac('sha256', gateway.keySecret)
    .update(`${orderId}|${paymentId}`).digest('hex');
  let caught = null;
  await appointmentController.verifyAndBook({
    user: { id: patient.id },
    body: {
      starts_at: startsAt, reason: 'Consultation', razorpay_order_id: orderId,
      razorpay_payment_id: paymentId, razorpay_signature: signature,
    },
  }, createMockRes(), (error) => { caught = error; });

  assert.match(caught?.message || '', /refund has been initiated/i);
  assert.match(caught?.message || '', /rfnd_slot_race/);
});
