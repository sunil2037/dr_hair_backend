import { BadRequestError, ConflictError, NotFoundError } from '../../../shared/errors/index.js';

export class CreateShiprocketShipmentUseCase {
  constructor({ orderRepository, shiprocketService, auditEventRepository }) {
    this.orderRepository = orderRepository;
    this.shiprocketService = shiprocketService;
    this.auditEventRepository = auditEventRepository;
  }

  async execute({ orderId, actor = null }) {
    const cleanOrderId = String(orderId || '').trim();
    if (!cleanOrderId) throw new BadRequestError('Order ID is required');

    this.shiprocketService.assertConfigured();
    const order = await this.orderRepository.findById(cleanOrderId);
    if (!order) throw new NotFoundError('Order not found');

    if (['Cancelled', 'Refunded', 'Return requested'].includes(order.fulfillment.status)) {
      throw new BadRequestError(`Cannot ship an order in '${order.fulfillment.status}' status`);
    }
    if (order.fulfillment.status !== 'Preparing') {
      throw new BadRequestError('Move the order to Preparing before creating a Shiprocket shipment');
    }
    const isCod = order.payment?.gateway === 'cod';
    if (order.payment?.payment_status !== 'Paid' && !isCod) {
      throw new BadRequestError('Order must be paid or confirmed as Cash on Delivery before shipping');
    }

    const existingShipment = order.fulfillment.shiprocket_shipment_id || order.fulfillment.awb_code;
    if (existingShipment || ['processing', 'needs_review', 'created'].includes(order.fulfillment.shiprocket_status)) {
      throw new ConflictError(
        'This order already has a Shiprocket shipment or an unresolved Shiprocket request. Check Shiprocket before retrying.',
        null,
        'SHIPROCKET_SHIPMENT_EXISTS',
      );
    }

    this.shiprocketService.validateOrder(order);
    if (typeof this.orderRepository.claimShiprocketShipment === 'function') {
      const claimedOrder = await this.orderRepository.claimShiprocketShipment(cleanOrderId);
      if (!claimedOrder) {
        throw new ConflictError(
          'This order changed or a Shiprocket request is already in progress. Check the order and Shiprocket panel before retrying.',
          null,
          'SHIPROCKET_SHIPMENT_EXISTS',
        );
      }
    } else {
      await this.orderRepository.update(cleanOrderId, {
        fulfillment: { shiprocket_status: 'processing' },
      });
    }

    let shipment;
    try {
      shipment = await this.shiprocketService.createForwardShipment(order);
    } catch (error) {
      // A timeout can happen after Shiprocket has created the shipment. Require
      // an operator to reconcile the Shiprocket panel before another attempt.
      await this.orderRepository.update(cleanOrderId, {
        fulfillment: { shiprocket_status: error.retrySafe ? 'failed' : 'needs_review' },
      });
      throw error;
    }

    const updated = await this.orderRepository.update(cleanOrderId, {
      fulfillment: {
        courier: shipment.courierName || 'Shiprocket',
        tracking_number: shipment.awbCode,
        shiprocket_status: 'created',
        shiprocket_order_id: shipment.shiprocketOrderId,
        shiprocket_shipment_id: shipment.shipmentId,
        awb_code: shipment.awbCode,
        shiprocket_pickup_scheduled_at: shipment.pickupScheduledAt,
      },
    });
    updated.addTimelineEvent(
      `Shiprocket shipment created${shipment.courierName ? ` with ${shipment.courierName}` : ''} (AWB: ${shipment.awbCode}); pickup requested and awaiting courier handoff`,
    );
    await this.orderRepository.update(cleanOrderId, { timeline: updated.timeline });

    if (this.auditEventRepository) {
      await this.auditEventRepository.record({
        actor: actor || { id: 'admin', type: 'admin' },
        action: 'commerce.shiprocket.shipment_created',
        target: { id: cleanOrderId, type: 'order' },
        metadata: {
          shipmentId: shipment.shipmentId,
          awbCode: shipment.awbCode,
          courier: shipment.courierName,
        },
      });
    }

    return updated;
  }
}
