import { Order, OrderItem } from '../domain/Order.js';
import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';

export class CheckoutUseCase {
  constructor({
    orderRepository,
    productRepository,
    addressRepository,
    inventoryRepository,
    cartRepository,
    paymentGatewayService,
    auditEventRepository,
  }) {
    this.orderRepository = orderRepository;
    this.productRepository = productRepository;
    this.addressRepository = addressRepository;
    this.inventoryRepository = inventoryRepository;
    this.cartRepository = cartRepository;
    this.paymentGatewayService = paymentGatewayService;
    this.auditEventRepository = auditEventRepository;
  }

  async execute({
    userId,
    customer = {},
    items = [],
    addressId,
    shippingAddress,
    couponCode = null,
    paymentGateway = 'cod',
    idempotencyKey = null,
    actor = null,
  }) {
    const cleanUserId = String(userId).trim();
    if (!cleanUserId) {
      throw new BadRequestError('User ID is required for checkout');
    }
    if (!['cod', 'pay_at_clinic', 'razorpay'].includes(paymentGateway)) {
      throw new BadRequestError('Unsupported payment method');
    }

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = await this.orderRepository.findByIdempotencyKey(idempotencyKey, cleanUserId);
      if (existing) {
        // Return existing order without re-charging or re-reserving stock
        if (existing.payment.payment_status === 'Paid') {
          return { order: existing, paymentIntent: null, idempotentReplay: true };
        }
        const intent = existing.payment.gateway === 'razorpay'
          ? (existing.payment.payment_intent_id
            ? {
                intentId: existing.payment.payment_intent_id,
                orderId: existing.order_id,
                amount: Math.round(existing.pricing.total * 100),
                amountFormatted: existing.pricing.total,
                currency: 'INR',
                status: 'created',
                keyId: this.paymentGatewayService.keyId || process.env.RAZORPAY_KEY_ID || '',
              }
            : await this.paymentGatewayService.createPaymentIntent({
                orderId: existing.order_id,
                amount: existing.pricing.total,
                customer: existing.customer,
              }))
          : null;
        if (intent?.intentId && !existing.payment.payment_intent_id) {
          const updatedOrder = await this.orderRepository.update(existing.order_id, {
            payment: { payment_intent_id: intent.intentId },
          });
          return { order: updatedOrder, paymentIntent: intent, idempotentReplay: true };
        }
        return {
          order: existing,
          paymentIntent: intent,
          idempotentReplay: true,
        };
      }
    }

    if (paymentGateway === 'razorpay' && typeof this.paymentGatewayService.assertConfigured === 'function') {
      this.paymentGatewayService.assertConfigured();
    }

    // 2. Fetch & Validate Delivery Address
    let resolvedAddress = null;
    if (addressId) {
      resolvedAddress = await this.addressRepository.getById(cleanUserId, addressId);
      if (!resolvedAddress) {
        throw new NotFoundError(`Delivery address not found: ${addressId}`);
      }
    } else if (shippingAddress) {
      resolvedAddress = shippingAddress;
    } else {
      const addresses = await this.addressRepository.listByUserId(cleanUserId);
      resolvedAddress = addresses.find((a) => a.is_default) || addresses[0];
      if (!resolvedAddress) {
        throw new BadRequestError('Please provide or select a delivery address');
      }
    }

    // 3. Resolve Items & Server Pricing (Client cannot set price!)
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('Cannot checkout an empty order');
    }

    const orderItems = [];
    const stockReservationRequests = [];

    for (const reqItem of items) {
      const pId = reqItem.productId || reqItem.product_id;
      const qty = Math.max(1, parseInt(reqItem.quantity, 10) || 1);

      const product = this.productRepository.getById
        ? await this.productRepository.getById(pId)
        : await this.productRepository.findById(pId);
      if (!product) {
        throw new NotFoundError(`Product not found: ${pId}`);
      }

      // Determine price from server-owned product record or selected supply plan
      let unitPrice = Number(product.price) || 0;
      let planTitle = 'Standard';
      let mrp = Number(product.compare_at_price || product.mrp || product.price);

      if (reqItem.plan || reqItem.plan_id) {
        const planId = reqItem.plan_id || reqItem.plan;
        const plans = Array.isArray(product.supply_plans || product.supplyPlans)
          ? (product.supply_plans || product.supplyPlans)
          : [];
        const matchedPlan = plans.find((p) => p.id === planId || p.title === planId);
        if (matchedPlan) {
          unitPrice = Number(matchedPlan.price) || unitPrice;
          planTitle = matchedPlan.title || planTitle;
          mrp = Number(matchedPlan.mrp) || mrp;
        }
      }

      if (unitPrice <= 0) {
        throw new BadRequestError(`Invalid pricing configuration for ${product.name}`);
      }

      const imageUrl = Array.isArray(product.images) && product.images.length > 0
        ? product.images[0]
        : (product.image || '');

      orderItems.push(
        new OrderItem({
          product_id: product.id,
          title: product.name,
          subtitle: product.subtitle || '',
          price: unitPrice,
          mrp,
          quantity: qty,
          plan: planTitle,
          image_url: imageUrl,
          subtotal: unitPrice * qty,
        }),
      );

      stockReservationRequests.push({
        productId: product.id,
        quantity: qty,
      });
    }

    // 4. Server Pricing Calculation: Subtotal, Coupons, Delivery, Tax
    const subtotal = orderItems.reduce((acc, it) => acc + it.subtotal, 0);

    let discount = 0;
    let validatedCoupon = null;
    const cleanCoupon = couponCode ? String(couponCode).trim().toUpperCase() : null;

    if (cleanCoupon === 'FIRSTDR') {
      // 15% discount up to ₹500
      discount = Math.min(500, Math.round(subtotal * 0.15));
      validatedCoupon = 'FIRSTDR';
    } else if (cleanCoupon === 'FLAT100' && subtotal >= 499) {
      discount = 100;
      validatedCoupon = 'FLAT100';
    }

    const deliveryFee = subtotal >= 499 ? 0 : 50;
    const tax = 0; // Included in MRP in India
    const total = Math.max(0, subtotal - discount + deliveryFee + tax);

    // 5. Generate Order ID
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${datePrefix}-${randomSuffix}`;

    // 6. Atomic Stock Reservation (Throws ConflictError 409 if insufficient)
    await this.inventoryRepository.reserveStock(stockReservationRequests, orderId);

    // 7. Create Order Entity
    const order = new Order({
      order_id: orderId,
      idempotency_key: idempotencyKey,
      user_id: cleanUserId,
      customer: {
        name: customer.name || resolvedAddress.name || '',
        email: customer.email || '',
        phone: customer.phone || resolvedAddress.phone || '',
      },
      items: orderItems,
      shipping_address: resolvedAddress.toJSON ? resolvedAddress.toJSON() : resolvedAddress,
      pricing: {
        subtotal,
        discount,
        coupon_code: validatedCoupon,
        delivery_fee: deliveryFee,
        tax,
        total,
      },
      payment: {
        gateway: paymentGateway,
        payment_status: paymentGateway === 'cod' ? 'Pending' : 'Pending',
      },
      fulfillment: {
        status: 'New',
      },
      timeline: [
        {
          label: 'Order placed',
          timestamp: new Date().toISOString(),
          done: true,
        },
      ],
    });

    // 8. Persist Order
    const savedOrder = await this.orderRepository.create(order);

    // 9. Create the provider order before clearing the cart so a setup or
    // provider error leaves the shopper's cart available for another attempt.
    let paymentIntent = null;
    try {
      paymentIntent = paymentGateway === 'razorpay'
        ? await this.paymentGatewayService.createPaymentIntent({
          orderId: savedOrder.order_id,
          amount: savedOrder.pricing.total,
          customer: savedOrder.customer,
        })
        : null;
    } catch (error) {
      await this.inventoryRepository.releaseStock(savedOrder.items, savedOrder.order_id);
      await this.orderRepository.update(savedOrder.order_id, {
        fulfillment: {
          status: 'Cancelled',
          cancellation_reason: 'Payment order could not be created',
          cancelled_at: new Date().toISOString(),
        },
      });
      throw error;
    }

    const completedOrder = paymentIntent?.intentId
      ? await this.orderRepository.update(savedOrder.order_id, {
          payment: { payment_intent_id: paymentIntent.intentId },
        })
      : savedOrder;

    // 10. Clear Cart only after the gateway order was created successfully.
    await this.cartRepository.clearCart(cleanUserId);

    // 11. Record Audit Event
    if (this.auditEventRepository) {
      await this.auditEventRepository.record({
        actor: actor || { id: cleanUserId, type: 'patient' },
        action: 'commerce.order.created',
        target: { id: savedOrder.order_id, type: 'order' },
        metadata: {
          total: savedOrder.pricing.total,
          itemCount: savedOrder.items.length,
          idempotencyKey,
          gateway: paymentGateway,
        },
      });
    }

    return {
      order: completedOrder,
      paymentIntent,
      idempotentReplay: false,
    };
  }
}
