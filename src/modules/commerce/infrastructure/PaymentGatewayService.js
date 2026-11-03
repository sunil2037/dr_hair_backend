import crypto from 'crypto';
import { BadRequestError } from '../../../shared/errors/index.js';

export class PaymentGatewayService {
  constructor({ keyId, keySecret, webhookSecret } = {}) {
    this.keyId = keyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_drhair_dummy';
    this.keySecret = keySecret || process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_dummy_safe';
    this.webhookSecret = webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_dummy';
  }

  async createPaymentIntent({ orderId, amount, currency = 'INR', customer = {} }) {
    if (!orderId || amount <= 0) {
      throw new BadRequestError('Invalid order ID or payable amount for payment intent');
    }

    const intentId = `rzp_order_${orderId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return {
      intentId,
      orderId,
      amount: Math.round(amount * 100), // in paise
      amountFormatted: amount,
      currency,
      status: 'created',
      keyId: this.keyId,
      customer: {
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
      },
    };
  }

  verifyPaymentSignature({ orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature) {
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

  generateSignature(orderId, paymentId) {
    return crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
  }

  verifyWebhookSignature({ payload, signature, customSecret = null }) {
    if (!signature) return false;
    const secret = customSecret || this.webhookSecret;
    const dataString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(dataString)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      return signature === expected;
    }
  }

  async processRefund({ orderId, paymentIntentId, transactionId, amount, reason = 'Customer refund' }) {
    const refundId = `rfnd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      refundId,
      orderId,
      transactionId: transactionId || paymentIntentId || 'dummy_tx',
      amount,
      status: 'processed',
      reason,
      processedAt: new Date().toISOString(),
    };
  }
}
