import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';

export class UpdateFulfillmentUseCase {
  constructor({ orderRepository, auditEventRepository }) {
    this.orderRepository = orderRepository;
    this.auditEventRepository = auditEventRepository;
  }

  async execute({ orderId, status, courier = null, trackingNumber = null, actor = null }) {
    const cleanOrderId = String(orderId).trim();
    const order = await this.orderRepository.findById(cleanOrderId);
    if (!order) {
      throw new NotFoundError(`Order not found: ${cleanOrderId}`);
    }

    const current = order.fulfillment.status;
    const target = status;

    if (current === 'Cancelled' || current === 'Refunded') {
      throw new BadRequestError(`Cannot update fulfillment for order in '${current}' status`);
    }

    const patch = { fulfillment: {} };
    let timelineLabel = '';

    if (target === 'Preparing') {
      patch.fulfillment.status = 'Preparing';
      timelineLabel = 'Order is being packed and prepared for dispatch';
    } else if (target === 'Shipped') {
      const courierName = courier || order.fulfillment.courier;
      const tracking = trackingNumber || order.fulfillment.tracking_number;

      if (!tracking || !tracking.trim()) {
        throw new BadRequestError('Tracking number is required when marking an order as Shipped');
      }

      patch.fulfillment.status = 'Shipped';
      patch.fulfillment.courier = courierName || 'Blue Dart Express';
      patch.fulfillment.tracking_number = tracking.trim();
      patch.fulfillment.shipped_at = new Date().toISOString();
      timelineLabel = `Dispatched with ${patch.fulfillment.courier} (Tracking: ${patch.fulfillment.tracking_number})`;
    } else if (target === 'Delivered') {
      patch.fulfillment.status = 'Delivered';
      patch.fulfillment.delivered_at = new Date().toISOString();
      timelineLabel = 'Order delivered successfully';
    } else if (target === 'Needs attention') {
      patch.fulfillment.status = 'Needs attention';
      timelineLabel = 'Order flagged for clinical or fulfillment review';
    } else {
      throw new BadRequestError(`Unsupported fulfillment status transition: ${target}`);
    }

    const updated = await this.orderRepository.update(cleanOrderId, patch);
    updated.addTimelineEvent(timelineLabel);
    await this.orderRepository.update(cleanOrderId, { timeline: updated.timeline });

    if (this.auditEventRepository) {
      await this.auditEventRepository.record({
        actor: actor || { id: 'admin', type: 'admin' },
        action: 'commerce.fulfillment.updated',
        target: { id: cleanOrderId, type: 'order' },
        metadata: {
          previousStatus: current,
          newStatus: target,
          courier: patch.fulfillment.courier,
          trackingNumber: patch.fulfillment.tracking_number,
        },
      });
    }

    return updated;
  }
}
