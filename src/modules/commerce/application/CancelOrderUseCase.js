import { BadRequestError, NotFoundError, ForbiddenError } from '../../../shared/errors/index.js';

export class CancelOrderUseCase {
  constructor({ orderRepository, inventoryRepository, auditEventRepository }) {
    this.orderRepository = orderRepository;
    this.inventoryRepository = inventoryRepository;
    this.auditEventRepository = auditEventRepository;
  }

  async execute({ orderId, userId, reason = 'Customer requested cancellation', actor = null }) {
    const cleanOrderId = String(orderId).trim();
    const order = await this.orderRepository.findById(cleanOrderId);
    if (!order) {
      throw new NotFoundError(`Order not found: ${cleanOrderId}`);
    }

    // Ownership check if called by patient
    if (userId && String(order.user_id) !== String(userId).trim()) {
      throw new ForbiddenError('You can only cancel your own orders');
    }

    if (order.payment.payment_status === 'Paid') {
      throw new BadRequestError('Paid orders must be refunded instead of cancelled');
    }

    const currentStatus = order.fulfillment.status;
    if (['Shipped', 'Delivered', 'Cancelled', 'Refunded'].includes(currentStatus)) {
      throw new BadRequestError(`Cannot cancel order in '${currentStatus}' status`);
    }

    // 1. Release reserved stock
    await this.inventoryRepository.releaseStock(order.items, order.order_id);

    // 2. Update order status
    const updated = await this.orderRepository.update(cleanOrderId, {
      fulfillment: {
        status: 'Cancelled',
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
      },
    });

    updated.addTimelineEvent(`Order cancelled: ${reason}`);
    await this.orderRepository.update(cleanOrderId, { timeline: updated.timeline });

    if (this.auditEventRepository) {
      await this.auditEventRepository.record({
        actor: actor || { id: userId || order.user_id, type: userId ? 'patient' : 'admin' },
        action: 'commerce.order.cancelled',
        target: { id: cleanOrderId, type: 'order' },
        metadata: {
          reason,
          previousStatus: currentStatus,
        },
      });
    }

    return updated;
  }
}
