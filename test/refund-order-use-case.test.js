import test from 'node:test';
import assert from 'node:assert/strict';
import { RefundOrderUseCase } from '../src/modules/commerce/application/RefundOrderUseCase.js';
import { Order } from '../src/modules/commerce/domain/Order.js';

function setup({ refundStatuses = ['processed', 'processed'] } = {}) {
  let currentOrder = new Order({
    order_id: 'ORD-REFUND-TEST',
    user_id: 'patient-1',
    items: [{ product_id: 'serum-1', title: 'Serum', price: 100, quantity: 1 }],
    pricing: { subtotal: 100, delivery_fee: 0, total: 100 },
    payment: {
      gateway: 'razorpay',
      payment_status: 'Paid',
      payment_intent_id: 'order_rzp_1',
      transaction_id: 'pay_rzp_1',
    },
    fulfillment: { status: 'Delivered' },
  });
  const refundCalls = [];
  const restocks = [];
  const orderRepository = {
    async findById() { return currentOrder; },
    async update(_id, patch) {
      const data = currentOrder.toJSON();
      for (const [key, value] of Object.entries(patch)) {
        data[key] = value && typeof value === 'object' && !Array.isArray(value)
          ? { ...data[key], ...value }
          : value;
      }
      currentOrder = new Order(data);
      return currentOrder;
    },
  };
  const paymentGatewayService = {
    async processRefund(input) {
      refundCalls.push(input);
      return {
        id: `rfnd_${refundCalls.length}`,
        status: refundStatuses[refundCalls.length - 1] || 'processed',
      };
    },
  };
  const inventoryRepository = {
    async releaseStock(items, orderId) { restocks.push({ items, orderId }); },
  };
  return {
    useCase: new RefundOrderUseCase({ orderRepository, inventoryRepository, paymentGatewayService }),
    getOrder: () => currentOrder,
    refundCalls,
    restocks,
  };
}

test('order refunds accumulate partial amounts and restock only after a full processed refund', async () => {
  const { useCase, getOrder, refundCalls, restocks } = setup();

  const partial = await useCase.execute({ orderId: 'ORD-REFUND-TEST', amount: 30, restockInventory: false });
  assert.equal(partial.payment.payment_status, 'Partially refunded');
  assert.equal(partial.payment.refund_amount, 30);
  assert.equal(restocks.length, 0);

  const full = await useCase.execute({ orderId: 'ORD-REFUND-TEST', amount: 70, restockInventory: true });
  assert.equal(full.payment.payment_status, 'Refunded');
  assert.equal(full.payment.refund_amount, 100);
  assert.equal(getOrder().payment.refund_amount, 100);
  assert.equal(refundCalls.length, 2);
  assert.match(refundCalls[0].receipt, /^drh_[a-f0-9]{32}$/);
  assert.notEqual(refundCalls[0].receipt, refundCalls[1].receipt);
  assert.equal(restocks.length, 1);
});

test('partial refund cannot restock the full order and pending refund blocks duplicates', async () => {
  const invalid = setup();
  await assert.rejects(
    invalid.useCase.execute({ orderId: 'ORD-REFUND-TEST', amount: 20, restockInventory: true }),
    /partial refund cannot restock/i,
  );
  assert.equal(invalid.refundCalls.length, 0);

  const pending = setup({ refundStatuses: ['pending'] });
  const initiated = await pending.useCase.execute({ orderId: 'ORD-REFUND-TEST', amount: 40, restockInventory: false });
  assert.equal(initiated.payment.payment_status, 'Paid');
  assert.equal(initiated.payment.refund_status, 'pending');
  assert.equal(initiated.payment.refund_amount, 0);
  assert.equal(initiated.payment.refund_pending_amount, 40);
  assert.equal(pending.restocks.length, 0);
  await assert.rejects(
    pending.useCase.execute({ orderId: 'ORD-REFUND-TEST', amount: 40, restockInventory: false }),
    /refund is already pending/i,
  );
});
