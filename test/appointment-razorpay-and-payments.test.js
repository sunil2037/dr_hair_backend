import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createContainer } from '../src/container.js';

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

  paymentGatewayService.fetch = async () => ({
    ok: true,
    json: async () => ({
      id: 'order_rzp_mock_unit_123',
      amount: 65000,
      currency: 'INR',
      status: 'created',
    }),
  });

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
