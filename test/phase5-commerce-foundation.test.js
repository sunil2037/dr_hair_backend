import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { TokenService } from '../src/shared/utils/token.service.js';
import { store } from '../src/shared/database/store.js';
import { ConflictError, BadRequestError } from '../src/shared/errors/index.js';

test('Phase 5: Commerce Foundation & Order Lifecycle Tests', async (t) => {
  const container = createContainer();
  const {
    checkoutUseCase,
    verifyPaymentUseCase,
    cancelOrderUseCase,
    refundOrderUseCase,
    updateFulfillmentUseCase,
  } = container.useCases;
  const {
    addressRepository,
    inventoryRepository,
    orderRepository,
    productRepository,
    auditEventRepository,
  } = container.repositories;
  const { paymentGatewayService } = container.services;

  // Setup seed products in memory store
  store.products = [
    {
      id: 'serum-follicle-1',
      name: 'Follicle Booster Serum',
      subtitle: '5% Procapil & 3% Redensyl',
      category: 'Serum',
      price: 1200,
      mrp: 1500,
      stock: 10,
      in_stock: true,
      inStock: true,
      supply_plans: [
        { id: 'plan-3m', title: '3-Month Plan', price: 2999, mrp: 4500 },
      ],
    },
    {
      id: 'anti-dandruff-shampoo',
      name: 'Ketoconazole 2% Scalp Therapy Shampoo',
      subtitle: 'Dermatological Cleanser',
      category: 'Shampoo',
      price: 450,
      mrp: 550,
      stock: 2, // low stock for concurrency tests
      in_stock: true,
      inStock: true,
    },
  ];

  store.addresses = [];
  store.orders = [];
  store.inventoryLedgers = [];
  store.auditEvents = [];

  const patientId = 'patient_comm_123';
  const patientToken = TokenService.generateAccessToken({ id: patientId, role: 'patient', phone: '9876543210' });

  await t.test('1. Patient Delivery Addresses CRUD & Default Promotion', async () => {
    // 1.1 Create first address (should auto-become default)
    const addr1 = await container.controllers.commerceController.addressRepository.create(patientId, {
      name: 'Yash Sharma',
      phone: '9876543210',
      house_number: 'Flat 402, Royal Residency',
      street: 'Shipra Path',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302020',
      tag: 'Home',
    });

    assert.equal(addr1.is_default, true);
    assert.equal(addr1.city, 'Jaipur');

    // 1.2 Create second address as default
    const addr2 = await container.controllers.commerceController.addressRepository.create(patientId, {
      name: 'Yash Sharma (Office)',
      phone: '9876543210',
      house_number: 'Tower B, 5th Floor',
      street: 'MI Road',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302001',
      tag: 'Work',
      is_default: true,
    });

    assert.equal(addr2.is_default, true);

    // Verify first address is now NOT default
    const refreshedAddr1 = await container.controllers.commerceController.addressRepository.getById(patientId, addr1.id);
    assert.equal(refreshedAddr1.is_default, false);

    // 1.3 List addresses
    const list = await container.controllers.commerceController.addressRepository.listByUserId(patientId);
    assert.equal(list.length, 2);
    assert.equal(list[0].id, addr2.id); // default address sorted first
  });

  await t.test('2. Server-Priced Checkout Calculation & Tamper Resistance', async () => {
    const address = (await container.controllers.commerceController.addressRepository.listByUserId(patientId))[0];

    // Attempting checkout: client passes item with client-side fabricated price ₹1
    const checkoutResult = await checkoutUseCase.execute({
      userId: patientId,
      customer: { name: 'Yash Sharma', email: 'yash@example.com', phone: '9876543210' },
      items: [
        {
          productId: 'serum-follicle-1',
          quantity: 2,
          price: 1, // Malicious attempt to pay ₹1!
        },
      ],
      addressId: address.id,
      couponCode: 'FIRSTDR',
      idempotencyKey: 'idem-key-checkout-001',
    });

    const order = checkoutResult.order;
    assert.ok(order);
    assert.equal(checkoutResult.idempotentReplay, false);

    // Assert that server resolved true price (2 * 1200 = 2400)
    assert.equal(order.pricing.subtotal, 2400);

    // Coupon FIRSTDR: 15% of 2400 = 360
    assert.equal(order.pricing.discount, 360);
    assert.equal(order.pricing.coupon_code, 'FIRSTDR');

    // Free delivery above ₹499
    assert.equal(order.pricing.delivery_fee, 0);

    // Final total: 2400 - 360 = 2040 (client-side price was ignored!)
    assert.equal(order.pricing.total, 2040);
    assert.equal(order.payment.payment_status, 'Pending');
    assert.equal(order.fulfillment.status, 'New');

    // Verify stock was atomically decremented from 10 to 8
    const stockAfter = await container.controllers.commerceController.inventoryRepository.getStock('serum-follicle-1');
    assert.equal(stockAfter, 8);

    // Verify payment intent was generated
    assert.ok(checkoutResult.paymentIntent);
    assert.equal(checkoutResult.paymentIntent.amount, 204000); // in paise
  });

  await t.test('3. Checkout Idempotency: Replaying Request Returns Same Order Without Re-charging', async () => {
    const address = (await container.controllers.commerceController.addressRepository.listByUserId(patientId))[0];

    // Re-send exact same checkout request with same idempotency key
    const replayResult = await checkoutUseCase.execute({
      userId: patientId,
      customer: { name: 'Yash Sharma', email: 'yash@example.com', phone: '9876543210' },
      items: [{ productId: 'serum-follicle-1', quantity: 2 }],
      addressId: address.id,
      couponCode: 'FIRSTDR',
      idempotencyKey: 'idem-key-checkout-001',
    });

    assert.equal(replayResult.idempotentReplay, true);
    assert.equal(replayResult.order.pricing.total, 2040);

    // Stock should NOT be deducted again (still 8)
    const stock = await container.controllers.commerceController.inventoryRepository.getStock('serum-follicle-1');
    assert.equal(stock, 8);
  });

  await t.test('4. Atomic Stock Reservation & 409 Conflict on Insufficient Stock', async () => {
    const address = (await container.controllers.commerceController.addressRepository.listByUserId(patientId))[0];

    // Product 'anti-dandruff-shampoo' only has 2 units in stock
    // Patient attempts to purchase 5 units
    await assert.rejects(
      async () => {
        await checkoutUseCase.execute({
          userId: patientId,
          items: [{ productId: 'anti-dandruff-shampoo', quantity: 5 }],
          addressId: address.id,
          idempotencyKey: 'idem-key-insufficient-001',
        });
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Insufficient stock/);
        return true;
      },
    );

    // Stock must remain unchanged at 2
    const remainingStock = await container.controllers.commerceController.inventoryRepository.getStock('anti-dandruff-shampoo');
    assert.equal(remainingStock, 2);
  });

  await t.test('5. Order Cancellation Releases Reserved Stock Back into Inventory', async () => {
    const address = (await container.controllers.commerceController.addressRepository.listByUserId(patientId))[0];

    // Place an order for 2 shampoos (takes stock from 2 -> 0)
    const checkoutResult = await checkoutUseCase.execute({
      userId: patientId,
      items: [{ productId: 'anti-dandruff-shampoo', quantity: 2 }],
      addressId: address.id,
      idempotencyKey: 'idem-key-cancel-test-001',
    });

    const orderId = checkoutResult.order.order_id;
    const stockAtZero = await container.controllers.commerceController.inventoryRepository.getStock('anti-dandruff-shampoo');
    assert.equal(stockAtZero, 0);

    // Patient cancels the order
    const cancelled = await cancelOrderUseCase.execute({
      orderId,
      userId: patientId,
      reason: 'Ordered by mistake',
    });

    assert.equal(cancelled.fulfillment.status, 'Cancelled');
    assert.equal(cancelled.fulfillment.cancellation_reason, 'Ordered by mistake');

    // Stock must be restored back to 2!
    const restoredStock = await container.controllers.commerceController.inventoryRepository.getStock('anti-dandruff-shampoo');
    assert.equal(restoredStock, 2);

    // Check inventory ledger movements
    const ledger = await container.controllers.commerceController.inventoryRepository.listLedger({ productId: 'anti-dandruff-shampoo' });
    const reservationEntry = ledger.items.find((l) => l.reference_type === 'RESERVATION' && l.reference_id === orderId);
    const releaseEntry = ledger.items.find((l) => l.reference_type === 'RELEASE' && l.reference_id === orderId);
    assert.ok(reservationEntry);
    assert.ok(releaseEntry);
  });

  await t.test('6. Payment Verification via Gateway Signature & Tamper Rejection', async () => {
    const orders = await container.controllers.commerceController.orderRepository.listByUserId(patientId);
    const orderToPay = orders.items.find((o) => o.fulfillment.status === 'New' && o.payment.payment_status === 'Pending');
    assert.ok(orderToPay);

    const orderId = orderToPay.order_id;
    const paymentId = 'pay_test_rzp_999';

    // 6.1 Tampered signature fails verification
    await assert.rejects(
      async () => {
        await verifyPaymentUseCase.execute({
          orderId,
          paymentId,
          paymentSignature: 'fake_tampered_signature_hex_123',
        });
      },
      (err) => {
        assert.ok(err instanceof BadRequestError);
        assert.match(err.message, /Invalid payment verification signature/);
        return true;
      },
    );

    // 6.2 Valid signature verifies payment
    const validSignature = paymentGatewayService.generateSignature(orderId, paymentId);
    const verifiedOrder = await verifyPaymentUseCase.execute({
      orderId,
      paymentId,
      paymentSignature: validSignature,
    });

    assert.equal(verifiedOrder.payment.payment_status, 'Paid');
    assert.equal(verifiedOrder.payment.transaction_id, paymentId);
    assert.ok(verifiedOrder.payment.paid_at);
  });

  await t.test('7. Admin Order Fulfillment Lifecycle Transitions', async () => {
    const orders = await container.controllers.commerceController.orderRepository.listByUserId(patientId);
    const paidOrder = orders.items.find((o) => o.payment.payment_status === 'Paid');
    assert.ok(paidOrder);
    const orderId = paidOrder.order_id;

    // 7.1 Start preparing
    const prepOrder = await updateFulfillmentUseCase.execute({
      orderId,
      status: 'Preparing',
    });
    assert.equal(prepOrder.fulfillment.status, 'Preparing');

    // 7.2 Shipped requires tracking number
    await assert.rejects(
      async () => {
        await updateFulfillmentUseCase.execute({
          orderId,
          status: 'Shipped',
          trackingNumber: '', // missing tracking number
        });
      },
      (err) => {
        assert.ok(err instanceof BadRequestError);
        assert.match(err.message, /Tracking number is required/);
        return true;
      },
    );

    // 7.3 Dispatched / Shipped with courier and tracking number
    const shippedOrder = await updateFulfillmentUseCase.execute({
      orderId,
      status: 'Shipped',
      courier: 'Delhivery Surface',
      trackingNumber: 'DEL-TRK-789012',
    });
    assert.equal(shippedOrder.fulfillment.status, 'Shipped');
    assert.equal(shippedOrder.fulfillment.courier, 'Delhivery Surface');
    assert.equal(shippedOrder.fulfillment.tracking_number, 'DEL-TRK-789012');
    assert.ok(shippedOrder.fulfillment.shipped_at);

    // 7.4 Mark Delivered
    const deliveredOrder = await updateFulfillmentUseCase.execute({
      orderId,
      status: 'Delivered',
    });
    assert.equal(deliveredOrder.fulfillment.status, 'Delivered');
    assert.ok(deliveredOrder.fulfillment.delivered_at);
  });

  await t.test('8. Admin Refund with Inventory Restock and Audit Logging', async () => {
    const orders = await container.controllers.commerceController.orderRepository.listByUserId(patientId);
    const deliveredOrder = orders.items.find((o) => o.fulfillment.status === 'Delivered');
    assert.ok(deliveredOrder);
    const orderId = deliveredOrder.order_id;

    const stockBeforeRefund = await container.controllers.commerceController.inventoryRepository.getStock('serum-follicle-1');

    // Process refund of ₹2040
    const refundedOrder = await refundOrderUseCase.execute({
      orderId,
      amount: 2040,
      reason: 'Customer return due to change of regimen',
      restockInventory: true,
      actor: { id: 'admin_1', type: 'admin' },
    });

    assert.equal(refundedOrder.payment.payment_status, 'Refunded');
    assert.equal(refundedOrder.fulfillment.status, 'Refunded');
    assert.ok(refundedOrder.payment.refund_id);
    assert.equal(refundedOrder.payment.refund_amount, 2040);

    // Stock for 2 serums should be restocked (+2)
    const stockAfterRefund = await container.controllers.commerceController.inventoryRepository.getStock('serum-follicle-1');
    assert.equal(stockAfterRefund, stockBeforeRefund + 2);

    // Audit event recorded
    const auditEvents = await auditEventRepository.list();
    const refundEvent = auditEvents.items.find(
      (e) => e.action === 'commerce.order.refunded' && (e.target === orderId || e.target?.id === orderId || e.target_id === orderId),
    );
    assert.ok(refundEvent);
  });

  await t.test('9. Admin Permissions: Unauthorized Admin Receives 403 FORBIDDEN', async () => {
    const adminTokenNoOrders = TokenService.generateAccessToken({
      id: 'admin_content_only',
      role: 'admin',
      permissions: ['content.edit', 'media.upload'], // Does NOT have 'orders.manage'
    });

    const superAdminToken = TokenService.generateAccessToken({
      id: 'super_admin_yash',
      role: 'super_admin',
    });

    // Test permission check on admin orders route
    const { requirePermission } = await import('../src/shared/middlewares/admin.middleware.js');
    const ordersGuard = requirePermission('orders.manage');

    let blockedStatus = null;
    let blockedCode = null;
    const reqMockBlocked = { user: TokenService.verifyToken(adminTokenNoOrders) };
    const resMock = {};
    ordersGuard(reqMockBlocked, resMock, (err) => {
      if (err) {
        blockedStatus = err.statusCode;
        blockedCode = err.code;
      }
    });

    assert.equal(blockedStatus, 403);
    assert.equal(blockedCode, 'FORBIDDEN');

    // Super admin passes through without error
    let allowedPassed = false;
    const reqMockSuper = { user: TokenService.verifyToken(superAdminToken) };
    ordersGuard(reqMockSuper, resMock, (err) => {
      if (!err) allowedPassed = true;
    });
    assert.equal(allowedPassed, true);
  });
});
