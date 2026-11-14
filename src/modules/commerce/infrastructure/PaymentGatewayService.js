import crypto from 'crypto';
import { BadGatewayError, BadRequestError, ServiceUnavailableError } from '../../../shared/errors/index.js';

const RAZORPAY_API_URL = 'https://api.razorpay.com/v1';

export class PaymentGatewayService {
  constructor({ keyId, keySecret, webhookSecret, fetchImpl = globalThis.fetch } = {}) {
    this.keyId = keyId || process.env.RAZORPAY_KEY_ID || '';
    this.keySecret = keySecret || process.env.RAZORPAY_KEY_SECRET || '';
    this.webhookSecret = webhookSecret !== undefined
      ? String(webhookSecret).trim()
      : process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || '';
    this.fetch = fetchImpl;
  }

  assertConfigured() {
    if (!this.keyId || !this.keySecret) {
      throw new ServiceUnavailableError(
        'Razorpay online payments are not configured. Add matching Razorpay Test Mode or Live API credentials to the backend environment.',
        null,
        'RAZORPAY_NOT_CONFIGURED',
      );
    }
  }

  async createPaymentIntent({ orderId, amount, currency = 'INR', customer = {}, metadata = {} }) {
    if (!orderId || amount <= 0) {
      throw new BadRequestError('Invalid order ID or payable amount for payment intent');
    }

    this.assertConfigured();

    let response;
    try {
      response = await this.fetch(`${RAZORPAY_API_URL}/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency,
          receipt: String(orderId).slice(0, 40),
          notes: {
            app_order_id: String(orderId),
            ...Object.fromEntries(
              Object.entries(metadata || {})
                .filter(([key, value]) => /^[a-zA-Z0-9_]{1,40}$/.test(key) && value != null)
                .slice(0, 14)
                .map(([key, value]) => [key, String(value).slice(0, 256)]),
            ),
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BadGatewayError('Could not reach Razorpay to create a payment order.');
    }

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.id) {
      throw new BadGatewayError('Razorpay could not create the payment order. Check the merchant account and API keys.');
    }

    return {
      intentId: result.id,
      orderId,
      amount: result.amount,
      amountFormatted: amount,
      currency: result.currency || currency,
      status: result.status || 'created',
      keyId: this.keyId,
      customer: {
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
      },
    };
  }

  verifyPaymentSignature({ orderId, paymentId, signature }) {
    if (!this.keySecret || !orderId || !paymentId || !signature) {
      return false;
    }
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      return signature === expected;
    }
  }

  async verifyCapturedPayment({ paymentId, expectedOrderId, expectedAmount, currency = 'INR' }) {
    this.assertConfigured();
    const payment = await this.request(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
    if (payment.order_id !== expectedOrderId) {
      throw new BadRequestError('Razorpay payment does not belong to this order');
    }
    if (Number(payment.amount) !== Math.round(expectedAmount * 100) || payment.currency !== currency) {
      throw new BadRequestError('Razorpay payment amount or currency does not match this order');
    }

    if (payment.status === 'authorized') {
      const captured = await this.request(`/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(payment.amount), currency }),
      });
      if (captured.status !== 'captured') {
        throw new BadGatewayError('Razorpay did not confirm that the payment was captured.');
      }
      return captured;
    }

    if (payment.status !== 'captured') {
      throw new BadRequestError('Razorpay payment is not captured');
    }
    return payment;
  }

  async getPaymentOrder(orderId) {
    this.assertConfigured();
    if (!orderId) throw new BadRequestError('A Razorpay order ID is required.');
    return this.request(`/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
  }

  async refundCapturedPayment({ paymentId, amount, currency = 'INR', reason = 'Customer refund', receipt = null }) {
    this.assertConfigured();
    if (!paymentId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw new BadRequestError('A valid captured payment and refund amount are required.');
    }
    const body = {
      amount: Math.round(Number(amount) * 100),
      speed: 'normal',
      notes: { reason: String(reason).slice(0, 256) },
      ...(receipt ? { receipt: String(receipt).slice(0, 40) } : {}),
    };
    const refund = await this.request(`/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!refund?.id || !['pending', 'processed', 'failed'].includes(refund.status)) {
      throw new BadGatewayError('Razorpay did not return a recognized refund result. Check the payment in the Razorpay Dashboard before retrying.');
    }
    return refund;
  }

  async request(path, options) {
    let response;
    try {
      response = await this.fetch(`${RAZORPAY_API_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      const error = new BadGatewayError('Razorpay did not confirm the request result. Check the Razorpay Dashboard before retrying.');
      error.retrySafe = false;
      throw error;
    }

    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      const error = new BadGatewayError(`Razorpay request failed with status ${response.status}. Reconcile the provider status before retrying.`);
      error.retrySafe = response.status >= 400 && response.status < 500;
      throw error;
    }
    return result;
  }

  generateSignature(orderId, paymentId) {
    if (!this.keySecret) return '';
    return crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
  }

  verifyWebhookSignature({ rawBody, signature, customSecret = null }) {
    const body = Buffer.isBuffer(rawBody)
      ? rawBody
      : typeof rawBody === 'string'
        ? Buffer.from(rawBody, 'utf8')
        : null;
    const secret = customSecret || this.webhookSecret;
    if (!signature || !secret || !body || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = crypto.createHmac('sha256', secret).update(body).digest();
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  }

  async processRefund({ orderId, transactionId, amount, reason = 'Customer refund', receipt }) {
    if (!transactionId) {
      throw new BadRequestError('A captured Razorpay payment ID is required to refund this order.');
    }
    return this.refundCapturedPayment({
      paymentId: transactionId,
      amount,
      reason: `${orderId}: ${reason}`,
      receipt,
    });
  }
}
