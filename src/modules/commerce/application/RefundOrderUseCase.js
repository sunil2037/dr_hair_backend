import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';

export class RefundOrderUseCase {
  constructor({ orderRepository, inventoryRepository, paymentGatewayService, auditEventRepository }) {
    this.orderRepository = orderRepository;
    this.inventoryRepository = inventoryRepository;
    this.paymentGatewayService = paymentGatewayService;
    this.auditEventRepository = auditEventRepository;
  }

  async execute({ orderId, amount = null, reason = 'Customer refund', restockInventory = true, actor = null }) {
    const cleanOrderId = String(orderId).trim();
    const order = await this.orderRepository.findById(cleanOrderId);
    if (!order) {
      throw new NotFoundError(`Order not found: ${cleanOrderId}`);
    }

    if (order.payment.payment_status === 'Refunded') {
      throw new BadRequestError('Order is already refunded');
    }

    const refundAmount = amount !== null ? Number(amount) : order.pricing.total;
    if (refundAmount <= 0 || refundAmount > order.pricing.total) {
      throw new BadRequestError(`Invalid refund amount: ₹${refundAmount}`);
    }

    // 1. Process with gateway
    const refundResult = await this.paymentGatewayService.processRefund({
      orderId: cleanOrderId,
      paymentIntentId: order.payment.payment_intent_id,
      transactionId: order.payment.transaction_id,
      amount: refundAmount,
      reason,
    });

    // 2. Restock inventory if specified and order was not already cancelled
    if (restockInventory && order.fulfillment.status !== 'Cancelled') {
      await this.inventoryRepository.releaseStock(order.items, cleanOrderId);
    }

    // 3. Update order state
    const isFullRefund = refundAmount >= order.pricing.total;
    const nextPaymentStatus = isFullRefund ? 'Refunded' : 'Partially refunded';
    const nextFulfillmentStatus = isFullRefund ? 'Refunded' : order.fulfillment.status;

    const updated = await this.orderRepository.update(cleanOrderId, {
      payment: {
        payment_status: nextPaymentStatus,
        refund_id: refundResult.refundId,
        refund_amount: refundAmount,
        refunded_at: new Date().toISOString(),
      },
      fulfillment: {
        status: nextFulfillmentStatus,
      },
    });

    updated.addTimelineEvent(`Refund of ₹${refundAmount} processed (${refundResult.refundId}): ${reason}`);
    await this.orderRepository.update(cleanOrderId, { timeline: updated.timeline });

    if (this.auditEventRepository) {
      await this.auditEventRepository.record({
        actor: actor || { id: 'admin', type: 'admin' },
        action: 'commerce.order.refunded',
        target: { id: cleanOrderId, type: 'order' },
        metadata: {
          refundAmount,
          refundId: refundResult.refundId,
          reason,
          restockInventory,
        },
      });
    }

    return updated;
  }
}
