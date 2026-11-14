import { createHash } from 'node:crypto';
import { BadGatewayError, BadRequestError, ConflictError, NotFoundError } from '../../../shared/errors/index.js';

export class RefundOrderUseCase {
  constructor({ orderRepository, inventoryRepository, paymentGatewayService, auditEventRepository }) {
    this.orderRepository = orderRepository;
    this.inventoryRepository = inventoryRepository;
    this.paymentGatewayService = paymentGatewayService;
    this.auditEventRepository = auditEventRepository;
  }

  async execute({ orderId, amount = null, reason = 'Customer refund', restockInventory = false, actor = null }) {
    const cleanOrderId = String(orderId).trim();
    const order = await this.orderRepository.findById(cleanOrderId);
    if (!order) {
      throw new NotFoundError(`Order not found: ${cleanOrderId}`);
    }

    if (order.payment.gateway !== 'razorpay' || !order.payment.transaction_id) {
      throw new BadRequestError('Automatic refunds are available only for orders with a captured Razorpay payment. Process COD or offline refunds through the original payment method.');
    }
    if (!['Paid', 'Partially refunded'].includes(order.payment.payment_status)) {
      throw new BadRequestError('Only a captured Razorpay payment can be refunded.');
    }
    if (order.payment.refund_status === 'pending' || Number(order.payment.refund_pending_amount) > 0) {
      throw new ConflictError('A Razorpay refund is already pending. Check its status before requesting another refund.');
    }

    const refundAmount = amount !== null ? Number(amount) : order.pricing.total;
    const previouslyRefunded = Number(order.payment.refund_amount) || 0;
    const remaining = Math.max(0, Number(order.pricing.total) - previouslyRefunded);
    const refundPaise = Math.round(refundAmount * 100);
    if (!Number.isFinite(refundAmount) || refundAmount < 1 || refundAmount > remaining || Math.abs(refundAmount * 100 - refundPaise) > 0.000001) {
      throw new BadRequestError(`Invalid refund amount: ₹${refundAmount}`);
    }
    const nextRefundTotal = previouslyRefunded + refundAmount;
    const isFullRefund = nextRefundTotal >= Number(order.pricing.total);
    if (restockInventory && !isFullRefund) {
      throw new BadRequestError('A partial refund cannot restock every item in the order. Use item-level return processing or turn off restocking.');
    }
    const receipt = `drh_${createHash('sha256')
      .update(`${cleanOrderId}:${previouslyRefunded.toFixed(2)}:${refundAmount.toFixed(2)}`)
      .digest('hex')
      .slice(0, 32)}`;

    // Razorpay accepts refunds asynchronously; never mark a pending refund as complete.
    const refundResult = await this.paymentGatewayService.processRefund({
      orderId: cleanOrderId,
      transactionId: order.payment.transaction_id,
      amount: refundAmount,
      reason,
      receipt,
    });
    if (refundResult.status === 'failed') {
      throw new BadGatewayError('Razorpay rejected this refund. The order and inventory were not changed.');
    }
    const isProcessed = refundResult.status === 'processed';
    const refundedTotal = isProcessed ? nextRefundTotal : previouslyRefunded;
    const nextPaymentStatus = isProcessed
      ? (refundedTotal >= Number(order.pricing.total) ? 'Refunded' : 'Partially refunded')
      : order.payment.payment_status;

    const nextFulfillmentStatus = isProcessed && refundedTotal >= Number(order.pricing.total)
      ? 'Refunded'
      : order.fulfillment.status;

    const updated = await this.orderRepository.update(cleanOrderId, {
      payment: {
        payment_status: nextPaymentStatus,
        refund_id: refundResult.id,
        refund_status: refundResult.status,
        refund_pending_amount: isProcessed ? 0 : refundAmount,
        refund_amount: refundedTotal,
        ...(isProcessed ? { refunded_at: new Date().toISOString() } : {}),
      },
      fulfillment: {
        status: nextFulfillmentStatus,
      },
    });

    updated.addTimelineEvent(isProcessed
      ? `Refund of ₹${refundAmount} processed (${refundResult.id}): ${reason}`
      : `Razorpay refund of ₹${refundAmount} initiated (${refundResult.id}); awaiting provider confirmation: ${reason}`);
    await this.orderRepository.update(cleanOrderId, { timeline: updated.timeline });

    // Save the provider-confirmed financial state before the separate inventory write.
    // If restocking fails, the refund remains visible and can be reconciled safely.
    if (isProcessed && restockInventory && order.fulfillment.status !== 'Cancelled') {
      await this.inventoryRepository.releaseStock(order.items, cleanOrderId);
    }

    if (this.auditEventRepository) {
      await this.auditEventRepository.record({
        actor: actor || { id: 'admin', type: 'admin' },
        action: isProcessed ? 'commerce.order.refunded' : 'commerce.order.refund_requested',
        target: { id: cleanOrderId, type: 'order' },
        metadata: {
          refundAmount,
          refundId: refundResult.id,
          reason,
          restockInventory,
          providerStatus: refundResult.status,
        },
      });
    }

    return updated;
  }
}
