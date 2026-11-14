import { sendSuccess, sendCreated } from '../../../shared/utils/response.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../../shared/errors/index.js';

export class CommerceController {
  constructor({
    addressRepository,
    inventoryRepository,
    orderRepository,
    couponRepository,
    checkoutUseCase,
    verifyPaymentUseCase,
    cancelOrderUseCase,
    refundOrderUseCase,
    updateFulfillmentUseCase,
    createShiprocketShipmentUseCase,
    shiprocketService,
    paymentGatewayService,
  }) {
    this.addressRepository = addressRepository;
    this.inventoryRepository = inventoryRepository;
    this.orderRepository = orderRepository;
    this.couponRepository = couponRepository;
    this.checkoutUseCase = checkoutUseCase;
    this.verifyPaymentUseCase = verifyPaymentUseCase;
    this.cancelOrderUseCase = cancelOrderUseCase;
    this.refundOrderUseCase = refundOrderUseCase;
    this.updateFulfillmentUseCase = updateFulfillmentUseCase;
    this.createShiprocketShipmentUseCase = createShiprocketShipmentUseCase;
    this.shiprocketService = shiprocketService;
    this.paymentGatewayService = paymentGatewayService;
  }

  // --- PATIENT ADDRESSES ---
  async listAddresses(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const items = await this.addressRepository.listByUserId(userId);
      return sendSuccess(res, items.map((a) => a.toJSON()), 'Delivery addresses retrieved');
    } catch (err) {
      next(err);
    }
  }

  async createAddress(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const created = await this.addressRepository.create(userId, req.body);
      return sendCreated(res, created.toJSON(), 'Delivery address saved');
    } catch (err) {
      next(err);
    }
  }

  async updateAddress(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const { addressId } = req.params;
      const updated = await this.addressRepository.update(userId, addressId, req.body);
      return sendSuccess(res, updated.toJSON(), 'Delivery address updated');
    } catch (err) {
      next(err);
    }
  }

  async deleteAddress(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const { addressId } = req.params;
      await this.addressRepository.delete(userId, addressId);
      return sendSuccess(res, { deleted: true }, 'Delivery address deleted');
    } catch (err) {
      next(err);
    }
  }

  async setDefaultAddress(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const { addressId } = req.params;
      const updated = await this.addressRepository.setDefault(userId, addressId);
      return sendSuccess(res, updated.toJSON(), 'Default address updated');
    } catch (err) {
      next(err);
    }
  }

  // --- CHECKOUT & PAYMENTS ---
  async checkout(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');

      const idempotencyKey =
        req.headers['idempotency-key'] ||
        req.headers['x-idempotency-key'] ||
        req.body?.idempotency_key ||
        req.body?.idempotencyKey ||
        null;

      const result = await this.checkoutUseCase.execute({
        userId,
        customer: req.body.customer || {
          name: req.user.name || '',
          email: req.user.email || '',
          phone: req.user.phone || '',
        },
        items: req.body.items || [],
        addressId: req.body.address_id || req.body.addressId || null,
        shippingAddress: req.body.shipping_address || req.body.shippingAddress || null,
        couponCode: req.body.coupon_code || req.body.couponCode || null,
        paymentGateway: req.body.payment_gateway || req.body.paymentGateway || 'cod',
        idempotencyKey,
        actor: { id: userId, type: 'patient' },
      });

      return sendCreated(res, {
        order: result.order.toJSON(),
        paymentIntent: result.paymentIntent,
        idempotentReplay: result.idempotentReplay,
      }, result.idempotentReplay ? 'Order replayed from idempotency key' : 'Order created successfully');
    } catch (err) {
      next(err);
    }
  }

  async verifyPayment(req, res, next) {
    try {
      const { order_id, orderId, payment_id, paymentId, payment_signature, signature } = req.body;
      const cleanOrderId = order_id || orderId;
      const cleanPaymentId = payment_id || paymentId;
      const cleanSignature = payment_signature || signature;

      if (!cleanOrderId || !cleanPaymentId) {
        throw new BadRequestError('Order ID and Payment ID are required');
      }

      const updated = await this.verifyPaymentUseCase.execute({
        orderId: cleanOrderId,
        paymentId: cleanPaymentId,
        paymentSignature: cleanSignature,
        userId: req.user?.id,
        isWebhook: false,
        actor: req.user ? { id: req.user.id, type: req.user.role ? 'admin' : 'patient' } : null,
      });

      return sendSuccess(res, updated.toJSON(), 'Payment verified successfully');
    } catch (err) {
      next(err);
    }
  }

  async handlePaymentWebhook(req, res, next) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const payload = req.body;

      const isValid = this.paymentGatewayService.verifyWebhookSignature({
        payload,
        signature,
      });

      if (!isValid) {
        throw new BadRequestError('Invalid webhook signature');
      }

      const event = payload.event;
      if (event === 'payment.captured' || event === 'order.paid') {
        const paymentEntity = payload.payload?.payment?.entity || {};
        const orderId = paymentEntity.notes?.app_order_id || paymentEntity.notes?.order_id;
        const paymentId = paymentEntity.id;

        if (orderId) {
          await this.verifyPaymentUseCase.execute({
            orderId,
            paymentId,
            isWebhook: true,
            actor: { id: 'webhook', type: 'system' },
          });
        }
      }

      return sendSuccess(res, { received: true }, 'Webhook processed');
    } catch (err) {
      next(err);
    }
  }

  // --- PATIENT ORDERS ---
  async listPatientOrders(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const status = req.query.status ? String(req.query.status).trim() : null;

      const result = await this.orderRepository.listByUserId(userId, { page, limit, status });
      return sendSuccess(res, {
        items: result.items.map((o) => o.toJSON()),
        total: result.total,
        page: result.page,
        limit: result.limit,
        has_more: result.has_more,
      }, 'Patient orders retrieved');
    } catch (err) {
      next(err);
    }
  }

  async getPatientOrder(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const { orderId } = req.params;

      const order = await this.orderRepository.findById(orderId);
      if (!order || String(order.user_id) !== String(userId).trim()) {
        throw new NotFoundError('Order not found');
      }
      return sendSuccess(res, order.toJSON(), 'Order details retrieved');
    } catch (err) {
      next(err);
    }
  }

  async trackPatientOrder(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');

      const order = await this.orderRepository.findById(req.params.orderId);
      if (!order || String(order.user_id) !== String(userId).trim()) {
        throw new NotFoundError('Order not found');
      }

      const fulfillment = order.fulfillment || {};
      if (!fulfillment.shiprocket_shipment_id && !fulfillment.awb_code) {
        throw new BadRequestError('Live tracking will appear after a Shiprocket AWB is assigned.');
      }

      const tracking = await this.shiprocketService.trackShipment({
        awbCode: fulfillment.awb_code || fulfillment.tracking_number,
        shipmentId: fulfillment.shiprocket_shipment_id,
      });
      return sendSuccess(res, tracking, 'Shipment tracking retrieved');
    } catch (err) {
      next(err);
    }
  }

  async cancelPatientOrder(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError('Authentication required');
      const { orderId } = req.params;
      const reason = req.body?.reason || 'Customer requested cancellation';

      const cancelled = await this.cancelOrderUseCase.execute({
        orderId,
        userId,
        reason,
        actor: { id: userId, type: 'patient' },
      });

      return sendSuccess(res, cancelled.toJSON(), 'Order cancelled and stock released');
    } catch (err) {
      next(err);
    }
  }

  // --- ADMIN ORDERS ---
  async listAdminOrders(req, res, next) {
    try {
      const { status, payment_status, paymentStatus, search, from_date, to_date, fromDate, toDate, page, limit } = req.query;

      const result = await this.orderRepository.listAdmin({
        status,
        paymentStatus: payment_status || paymentStatus,
        search,
        fromDate: from_date || fromDate,
        toDate: to_date || toDate,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 50,
      });

      return sendSuccess(res, {
        items: result.items.map((o) => o.toJSON()),
        total: result.total,
        page: result.page,
        limit: result.limit,
        has_more: result.has_more,
      }, 'Admin orders retrieved');
    } catch (err) {
      next(err);
    }
  }

  async getAdminOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const order = await this.orderRepository.findById(orderId);
      if (!order) throw new NotFoundError('Order not found');
      return sendSuccess(res, order.toJSON(), 'Order details retrieved');
    } catch (err) {
      next(err);
    }
  }

  async trackAdminOrder(req, res, next) {
    try {
      const order = await this.orderRepository.findById(req.params.orderId);
      if (!order) throw new NotFoundError('Order not found');

      const fulfillment = order.fulfillment || {};
      if (!fulfillment.shiprocket_shipment_id && !fulfillment.awb_code) {
        throw new BadRequestError('Live tracking will appear after a Shiprocket AWB is assigned.');
      }

      const tracking = await this.shiprocketService.trackShipment({
        awbCode: fulfillment.awb_code || fulfillment.tracking_number,
        shipmentId: fulfillment.shiprocket_shipment_id,
      });
      return sendSuccess(res, tracking, 'Shipment tracking retrieved');
    } catch (err) {
      next(err);
    }
  }

  async updateFulfillment(req, res, next) {
    try {
      const { orderId } = req.params;
      const { status, courier, tracking_number, trackingNumber } = req.body;

      const updated = await this.updateFulfillmentUseCase.execute({
        orderId,
        status,
        courier,
        trackingNumber: tracking_number || trackingNumber,
        actor: { id: req.admin?.id || 'admin', type: 'admin' },
      });

      return sendSuccess(res, updated.toJSON(), 'Order fulfillment status updated');
    } catch (err) {
      next(err);
    }
  }

  async createShiprocketShipment(req, res, next) {
    try {
      const { orderId } = req.params;
      const updated = await this.createShiprocketShipmentUseCase.execute({
        orderId,
        actor: { id: req.admin?.id || 'admin', type: 'admin' },
      });
      return sendSuccess(res, updated.toJSON(), 'Shiprocket shipment created and pickup requested');
    } catch (err) {
      next(err);
    }
  }

  async cancelAdminOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;

      const cancelled = await this.cancelOrderUseCase.execute({
        orderId,
        reason: reason || 'Cancelled by admin',
        actor: { id: req.admin?.id || 'admin', type: 'admin' },
      });

      return sendSuccess(res, cancelled.toJSON(), 'Order cancelled');
    } catch (err) {
      next(err);
    }
  }

  async refundAdminOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const { amount, reason, restock_inventory, restockInventory } = req.body;

      const refunded = await this.refundOrderUseCase.execute({
        orderId,
        amount: amount !== undefined ? amount : null,
        reason: reason || 'Customer refund',
        restockInventory: restock_inventory ?? restockInventory ?? true,
        actor: { id: req.admin?.id || 'admin', type: 'admin' },
      });

      return sendSuccess(res, refunded.toJSON(), 'Refund processed and recorded');
    } catch (err) {
      next(err);
    }
  }

  // --- ADMIN INVENTORY ---
  async restockProduct(req, res, next) {
    try {
      const { productId } = req.params;
      const { quantity, notes } = req.body;

      if (!quantity || quantity <= 0) {
        throw new BadRequestError('Valid restock quantity is required');
      }

      const newStock = await this.inventoryRepository.restock(
        productId,
        quantity,
        notes || 'Admin restock adjustment',
        req.admin?.id || 'admin',
      );

      return sendSuccess(res, { productId, newStock }, `Product restocked to ${newStock} units`);
    } catch (err) {
      next(err);
    }
  }

  async getProductLedger(req, res, next) {
    try {
      const { productId } = req.params;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;

      const ledger = await this.inventoryRepository.listLedger({ productId, page, limit });
      return sendSuccess(res, ledger, 'Inventory movement ledger retrieved');
    } catch (err) {
      next(err);
    }
  }

  // --- COUPONS ---
  async listCoupons(req, res, next) {
    try {
      const { status, page, limit } = req.query;
      const result = await this.couponRepository.list({ status, page, limit });
      return sendSuccess(res, result, 'Coupons retrieved');
    } catch (err) {
      next(err);
    }
  }

  async createCoupon(req, res, next) {
    try {
      const coupon = await this.couponRepository.create(req.body);
      return sendCreated(res, coupon, `Coupon ${coupon.code} created`);
    } catch (err) {
      next(err);
    }
  }

  async updateCoupon(req, res, next) {
    try {
      const { id } = req.params;
      const coupon = await this.couponRepository.update(id, req.body);
      return sendSuccess(res, coupon, `Coupon ${coupon.code} updated`);
    } catch (err) {
      next(err);
    }
  }

  async deleteCoupon(req, res, next) {
    try {
      const { id } = req.params;
      await this.couponRepository.delete(id);
      return sendSuccess(res, { id }, 'Coupon deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}
