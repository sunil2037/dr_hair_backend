import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PaymentGatewayService } from '../src/modules/commerce/infrastructure/PaymentGatewayService.js';

test('Razorpay webhooks require a configured secret and the original raw request bytes', () => {
  const rawBody = Buffer.from('{ "event" : "payment.captured", "payload": {} }');
  const signature = crypto.createHmac('sha256', 'test-hook-secret').update(rawBody).digest('hex');
  const service = new PaymentGatewayService({ webhookSecret: 'test-hook-secret' });

  assert.equal(service.verifyWebhookSignature({ rawBody, signature }), true);
  assert.equal(service.verifyWebhookSignature({ rawBody: Buffer.from(rawBody.toString().replaceAll(' ', '')), signature }), false);
  assert.equal(service.verifyWebhookSignature({ rawBody: null, payload: JSON.parse(rawBody.toString()), signature }), false);
  assert.equal(new PaymentGatewayService({ webhookSecret: '' }).verifyWebhookSignature({ rawBody, signature }), false);
});

test('Razorpay order refund calls the provider in paise with a stable receipt and reports its actual state', async () => {
  const calls = [];
  const service = new PaymentGatewayService({
    keyId: 'rzp_test_key',
    keySecret: 'test-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 'rfnd_test_123', status: 'pending', amount: 129900 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const refund = await service.processRefund({
    orderId: 'ORD-TEST-123',
    transactionId: 'pay_test_456',
    amount: 1299,
    reason: 'Customer return',
    receipt: 'drh_0123456789abcdef0123456789abcdef',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.razorpay.com/v1/payments/pay_test_456/refund');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    amount: 129900,
    speed: 'normal',
    notes: { reason: 'ORD-TEST-123: Customer return' },
    receipt: 'drh_0123456789abcdef0123456789abcdef',
  });
  assert.equal(refund.id, 'rfnd_test_123');
  assert.equal(refund.status, 'pending');
});

test('Razorpay order refund fails closed when there is no captured payment reference', async () => {
  const service = new PaymentGatewayService({ keyId: 'rzp_test_key', keySecret: 'test-secret' });
  await assert.rejects(
    service.processRefund({ orderId: 'ORD-TEST-123', amount: 100 }),
    /captured Razorpay payment ID is required/i,
  );
});
