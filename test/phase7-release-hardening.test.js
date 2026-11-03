import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createContainer } from '../src/container.js';
import { requestIdMiddleware } from '../src/shared/middlewares/requestId.middleware.js';
import { TokenService } from '../src/shared/utils/token.service.js';
import { store } from '../src/shared/database/store.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../src/shared/errors/index.js';

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return this.headers[k.toLowerCase()];
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

describe('Phase 7: Release Hardening & Staging Smoke Suite', () => {
  let container;

  beforeEach(() => {
    store.users = [];
    store.otps = new Map();
    store.orders = [];
    store.addresses = [];
    store.inventoryLedgers = [];
    store.hairTests = [];
    store.treatments = [];
    store.clinicalReports = [];
    store.progressCheckIns = [];
    store.patientActivities = [];
    store.products = [
      {
        id: 'clinical-shampoo-7',
        name: 'Ketoconazole 2% Scalp Solution',
        price: 550,
        mrp: 650,
        stock: 30,
        in_stock: true,
        category: 'Shampoo',
        supply_plans: [
          { id: 'plan-single', title: 'Single Bottle', price: 550, mrp: 650 },
        ],
      },
    ];

    let capturedOtp = null;
    const mockSmsService = {
      async sendOtp(dest, code) {
        capturedOtp = code;
        return true;
      },
    };

    container = createContainer({ smsService: mockSmsService });
    container.capturedOtpRef = () => capturedOtp;
  });

  // --- 1. HEALTH, TELEMETRY & REQUEST ID TRACING ---
  test('1. Request ID middleware generates UUID and preserves incoming trace headers', () => {
    // Case A: Missing request ID -> generates new req_ UUID
    const reqA = { headers: {} };
    const resA = createMockRes();
    let nextCalledA = false;

    requestIdMiddleware(reqA, resA, () => {
      nextCalledA = true;
    });

    assert.ok(nextCalledA);
    assert.ok(reqA.id.startsWith('req_'));
    assert.equal(resA.getHeader('x-request-id'), reqA.id);

    // Case B: Client passes trace ID -> preserves trace header verbatim
    const incomingTrace = 'trace-client-distributed-998811';
    const reqB = { headers: { 'x-request-id': incomingTrace } };
    const resB = createMockRes();
    let nextCalledB = false;

    requestIdMiddleware(reqB, resB, () => {
      nextCalledB = true;
    });

    assert.ok(nextCalledB);
    assert.equal(reqB.id, incomingTrace);
    assert.equal(resB.getHeader('x-request-id'), incomingTrace);
  });

  // --- 2. OBJECT-LEVEL AUTHORIZATION & IDOR ISOLATION ---
  test('2. IDOR Protection: Patient A cannot read or cancel Patient B order', async () => {
    const patientAId = 'patient_alpha_7';
    const patientBId = 'patient_beta_7';

    // Patient A creates an order
    const checkoutResult = await container.useCases.checkoutUseCase.execute({
      userId: patientAId,
      shippingAddress: {
        name: 'Alpha Sharma',
        phone: '+91 9876543210',
        house_number: '12',
        street: 'MG Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
      },
      items: [{ productId: 'clinical-shampoo-7', quantity: 1, plan: 'Single Bottle' }],
      idempotencyKey: 'idem-idor-alpha-1',
    });

    const orderId = checkoutResult.order.order_id;
    assert.ok(orderId);

    // Patient B attempts to fetch Patient A's order details via controller
    const reqGet = {
      user: { id: patientBId },
      params: { orderId },
    };
    const resGet = createMockRes();
    let getError = null;

    await container.controllers.commerceController.getPatientOrder(
      reqGet,
      resGet,
      (err) => { getError = err; }
    );

    assert.ok(getError instanceof NotFoundError);
    assert.equal(getError.message, 'Order not found');

    // Patient B attempts to cancel Patient A's order
    const reqCancel = {
      user: { id: patientBId },
      params: { orderId },
      body: { reason: 'Unauthorized cancellation attempt' },
    };
    const resCancel = createMockRes();
    let cancelError = null;

    await container.controllers.commerceController.cancelPatientOrder(
      reqCancel,
      resCancel,
      (err) => { cancelError = err; }
    );

    assert.ok(cancelError instanceof ForbiddenError || cancelError instanceof NotFoundError);

    // Order status remains New
    const orderRecord = await container.repositories.orderRepository.findById(orderId);
    assert.equal(orderRecord.fulfillment.status, 'New');
  });

  test('3. IDOR Protection: Patient A cannot download or delete Patient B clinical records', async () => {
    const patientAId = 101;
    const patientBId = 202;

    // Seed shared report for Patient A
    await container.repositories.clinicalReportRepository.create({
      id: 'rep_alpha_99',
      user_id: patientAId,
      title: 'Scalp Trichoscopy Analysis',
      file_name: 'analysis_rep.pdf',
      public_id: 'reports/user101/analysis_rep',
      format: 'pdf',
      visibility: 'Shared',
    });

    // Patient B attempts to download Patient A's report
    const reqDownload = {
      user: { id: patientBId },
      params: { reportId: 'rep_alpha_99' },
    };
    const resDownload = createMockRes();
    let downloadError = null;

    await container.controllers.patientClinicalController.downloadReport(
      reqDownload,
      resDownload,
      (err) => { downloadError = err; }
    );

    assert.ok(downloadError instanceof NotFoundError);
    assert.equal(downloadError.message, 'Patient report not found.');

    // Seed progress checkin for Patient A
    await container.repositories.progressCheckInRepository.createOnce({
      id: 'checkin_alpha_1',
      userId: patientAId,
      date: new Date().toISOString(),
      scalp_region: 'Crown',
      shedding_level: 'Normal',
      notes: 'Initial clinical baseline',
      density_rating: 4,
      photos: [],
    });

    // Patient B attempts to delete Patient A's progress checkin
    const reqDelete = {
      user: { id: patientBId },
      params: { checkInId: 'checkin_alpha_1' },
    };
    const resDelete = createMockRes();
    let deleteError = null;

    await container.controllers.patientClinicalController.deleteProgressCheckIn(
      reqDelete,
      resDelete,
      (err) => { deleteError = err; }
    );

    assert.ok(deleteError instanceof NotFoundError);
  });

  // --- 3. STAGING SMOKE: COMPLETE PATIENT JOURNEY ---
  test('4. Staging Smoke: Patient Sign-in, Profile, Assessment & Care flow', async () => {
    // Step 1: Send OTP
    const sendOtpRes = await container.useCases.sendOtpUseCase.execute({
      login: '9876543210',
    });
    assert.ok(sendOtpRes.message);

    // Step 2: Verify OTP
    const verifyOtpRes = await container.useCases.verifyOtpUseCase.execute({
      login: '9876543210',
      otp: container.capturedOtpRef() || '123456',
    });
    assert.ok(verifyOtpRes.token);

    // Step 3: Complete Patient Registration
    const signupRes = await container.useCases.registerUserUseCase.execute({
      name: 'Smoke Test Patient',
      phone: '9876543210',
      age: 28,
      gender: 'Male',
      city: 'Jaipur',
      verifiedLogin: '9876543210',
    });
    assert.ok(signupRes.user);
    const patientUserId = signupRes.user.id;

    // Step 4: Profile fetch
    const userProfile = await container.repositories.userRepository.findById(patientUserId);
    assert.ok(userProfile);
    assert.equal(userProfile.phone, '9876543210');

    // Step 5: Submit Hair Test questionnaire
    const hairTestRes = await container.useCases.submitHairTestUseCase.execute({
      userId: patientUserId,
      formData: {
        name: 'Smoke Test Patient',
        email: 'smoke@example.com',
        phone: '9876543210',
        age: '30',
        gender: 'Male',
        hair_fall_start: '3 months ago',
        stage: 'Stage 2',
      },
    });
    assert.ok(hairTestRes.reference_no);
    assert.equal(hairTestRes.test.reference_no, hairTestRes.reference_no);

    // Step 5: Read clinical record (Patient sees submitted assessment and awaiting review)
    const reqRecord = { user: { id: patientUserId } };
    const resRecord = createMockRes();
    await container.controllers.patientClinicalController.getClinicalRecord(
      reqRecord,
      resRecord,
      () => {}
    );

    assert.equal(resRecord.statusCode, 200);
    assert.ok(Array.isArray(resRecord.body.data.assessments));
    assert.equal(resRecord.body.data.assessments.length, 1);
    assert.equal(resRecord.body.data.assessments[0].reference_no, hairTestRes.reference_no);
  });

  // --- 4. STAGING SMOKE: COMPLETE CLINICAL & COMMERCE JOURNEY ---
  test('5. Staging Smoke: Clinician Reviews Case, Prescribes Treatment, and Fulfills Order', async () => {
    const patientUserId = 777;

    // Step 1: Clinician assigns treatment plan
    const treatmentResult = await container.repositories.treatmentRepository.create({
      reference_no: 'REF-SMOKE-PHASE7',
      userId: patientUserId,
      treatment_name: 'Intensive Follicle Recovery Program',
      doctor_name: 'Dr. Jai Bansal',
      instructions: 'Use cleanser daily; apply topical booster evening.',
      medications: [
        {
          name: 'Ketoconazole 2% Scalp Solution',
          dose: '5ml',
          frequency: 'Once every 2 days',
        },
      ],
      routine_steps: [
        {
          title: 'Evening Scalp Application',
          subtitle: 'Gently massage into crown',
          category: 'Treatment',
          time_of_day: 'Evening',
        },
      ],
    });
    assert.ok(treatmentResult);

    // Step 2: Patient executes server-priced checkout
    const checkoutRes = await container.useCases.checkoutUseCase.execute({
      userId: patientUserId,
      shippingAddress: {
        name: 'Smoke Verified Patient',
        phone: '+91 9988776655',
        house_number: 'Flat 101, Sunshine Heights',
        street: 'Tonk Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302015',
      },
      items: [{ productId: 'clinical-shampoo-7', quantity: 2, plan: 'Single Bottle' }],
      idempotencyKey: 'idem-smoke-checkout-7',
    });

    const orderId = checkoutRes.order.order_id;
    assert.ok(orderId);
    assert.equal(checkoutRes.order.pricing.subtotal, 1100);
    assert.equal(checkoutRes.order.fulfillment.status, 'New');

    // Verify stock was reserved atomically (30 - 2 = 28)
    const currentStock = await container.repositories.inventoryRepository.getStock('clinical-shampoo-7');
    assert.equal(currentStock, 28);

    // Step 3: Admin transitions order fulfillment lifecycle
    // Step 3a: Preparing
    const prepOrder = await container.useCases.updateFulfillmentUseCase.execute({
      orderId,
      status: 'Preparing',
      actor: { id: 'admin_1', type: 'admin' },
    });
    assert.equal(prepOrder.fulfillment.status, 'Preparing');

    // Step 3b: Shipped with courier & tracking
    const shippedOrder = await container.useCases.updateFulfillmentUseCase.execute({
      orderId,
      status: 'Shipped',
      courier: 'BlueDart Express',
      trackingNumber: 'BLUEDART-88992200',
      actor: { id: 'admin_1', type: 'admin' },
    });
    assert.equal(shippedOrder.fulfillment.status, 'Shipped');
    assert.equal(shippedOrder.fulfillment.courier, 'BlueDart Express');
    assert.equal(shippedOrder.fulfillment.tracking_number, 'BLUEDART-88992200');

    // Step 3c: Delivered
    const deliveredOrder = await container.useCases.updateFulfillmentUseCase.execute({
      orderId,
      status: 'Delivered',
      actor: { id: 'admin_1', type: 'admin' },
    });
    assert.equal(deliveredOrder.fulfillment.status, 'Delivered');

    // Step 4: Patient views tracking timeline
    const reqPatientOrder = {
      user: { id: patientUserId },
      params: { orderId },
    };
    const resPatientOrder = createMockRes();
    await container.controllers.commerceController.getPatientOrder(
      reqPatientOrder,
      resPatientOrder,
      () => {}
    );

    assert.equal(resPatientOrder.statusCode, 200);
    assert.equal(resPatientOrder.body.data.fulfillment.status, 'Delivered');
    assert.equal(resPatientOrder.body.data.fulfillment.courier, 'BlueDart Express');
    assert.equal(resPatientOrder.body.data.fulfillment.tracking_number, 'BLUEDART-88992200');
  });

  // --- 5. CRYPTOGRAPHIC VERIFICATION & RBAC ENFORCEMENT ---
  test('6. Payment Webhook HMAC validation rejects tampered signatures and accepts authentic ones', () => {
    const payload = {
      event: 'order.paid',
      payload: {
        payment: {
          entity: {
            id: 'pay_rzp_mock_123',
            amount: 110000,
            notes: { order_id: 'ord_sample_99' },
          },
        },
      },
    };

    // Generate authentic signature using webhookSecret
    const secret = container.services.paymentGatewayService.webhookSecret;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    // Authentic payload & signature
    const isValid = container.services.paymentGatewayService.verifyWebhookSignature({
      payload,
      signature,
    });
    assert.equal(isValid, true);

    // Tampered payload
    const tamperedPayload = { ...payload, event: 'refund.processed' };
    const isTamperedValid = container.services.paymentGatewayService.verifyWebhookSignature({
      payload: tamperedPayload,
      signature,
    });
    assert.equal(isTamperedValid, false);
  });
});
