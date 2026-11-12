import { BadRequestError, ForbiddenError, NotFoundError } from '../../../shared/errors/index.js';

export class VerifyPaymentUseCase {
  constructor({ orderRepository, paymentGatewayService, auditEventRepository }) {
    this.orderRepository = orderRepository;
    this.paymentGatewayService = paymentGatewayService;
    this.auditEventRepository = auditEventRepository;
  }

  async execute({ orderId, paymentId, paymentSignature, userId = null, isWebhook = false, actor = null }) {
    const cleanOrderId = String(orderId).trim();
    const order = await this.orderRepository.findById(cleanOrderId);
    if (!order) {
      throw new NotFoundError(`Order not found: ${cleanOrderId}`);
    }
    if (userId && String(order.user_id) !== String(userId).trim()) {
      throw new ForbiddenError('You can only verify payments for your own orders');
    }

    if (order.payment.payment_status === 'Paid') {
      return order; // Already verified idempotent
    }

    if (order.payment.gateway !== 'razorpay' || !order.payment.payment_intent_id || !paymentId) {
      throw new BadRequestError('This order does not have a Razorpay payment to verify');
    }

    if (!isWebhook) {
      const isValid = this.paymentGatewayService.verifyPaymentSignature({
        orderId: order.payment.payment_intent_id,
        paymentId,
        signature: paymentSignature,
      });

      if (!isValid) {
        throw new BadRequestError('Invalid payment verification signature from gateway');
      }
    }

    await this.paymentGatewayService.verifyCapturedPayment({
      paymentId,
      expectedOrderId: order.payment.payment_intent_id,
      expectedAmount: order.pricing.total,
    });

    const updated = await this.orderRepository.update(cleanOrderId, {
      payment: {
        payment_status: 'Paid',
        transaction_id: paymentId,
        payment_signature: paymentSignature,
        paid_at: new Date().toISOString(),
      },
    });

    updated.addTimelineEvent('Payment verified');
    await this.orderRepository.update(cleanOrderId, { timeline: updated.timeline });

    if (this.auditEventRepository) {
      await this.auditEventRepository.record({
        actor: actor || { id: order.user_id, type: 'patient' },
        action: 'commerce.payment.verified',
        target: { id: cleanOrderId, type: 'order' },
        metadata: {
          transactionId: paymentId,
          amount: order.pricing.total,
          isWebhook,
        },
      });
    }

    return updated;
  }
}
