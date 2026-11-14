import test from 'node:test';
import assert from 'node:assert/strict';
import { CreateShiprocketShipmentUseCase } from '../src/modules/commerce/application/CreateShiprocketShipmentUseCase.js';
import { CancelOrderUseCase } from '../src/modules/commerce/application/CancelOrderUseCase.js';
import { Order } from '../src/modules/commerce/domain/Order.js';

function makeOrder(overrides = {}) {
  return new Order({
    order_id: 'ORD-SR-TEST',
    user_id: 'patient-1',
    items: [{ product_id: 'serum-1', title: 'Serum', price: 100, quantity: 1 }],
    pricing: { subtotal: 100, delivery_fee: 0, total: 100 },
    payment: { gateway: 'cod', payment_status: 'Pending' },
    fulfillment: { status: 'Preparing', ...overrides },
  });
}

function mergeOrder(order, patch) {
  const data = order.toJSON();
  for (const [key, value] of Object.entries(patch)) {
    data[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? { ...data[key], ...value }
      : value;
  }
  return new Order(data);
}

test('creating a Shiprocket AWB requests pickup but does not claim courier handoff', async () => {
  let order = makeOrder();
  const orderRepository = {
    async findById() { return order; },
    async claimShiprocketShipment() {
      order = mergeOrder(order, { fulfillment: { shiprocket_status: 'processing' } });
      return order;
    },
    async update(_id, patch) {
      order = mergeOrder(order, patch);
      return order;
    },
  };
  const useCase = new CreateShiprocketShipmentUseCase({
    orderRepository,
    shiprocketService: {
      assertConfigured() {},
      validateOrder() {},
      async createForwardShipment() {
        return { shipmentId: '12345', awbCode: 'AWB-12345', courierName: 'Test Courier' };
      },
    },
  });

  const created = await useCase.execute({ orderId: 'ORD-SR-TEST' });
  assert.equal(created.fulfillment.status, 'Preparing');
  assert.equal(created.fulfillment.shipped_at, null);
  assert.equal(created.fulfillment.awb_code, 'AWB-12345');
  assert.equal(created.fulfillment.shiprocket_status, 'created');
  assert.match(created.timeline.at(-1).label, /awaiting courier handoff/i);
});

test('local cancellation cannot release stock after a Shiprocket shipment was created', async () => {
  let released = false;
  const useCase = new CancelOrderUseCase({
    orderRepository: { async findById() { return makeOrder({ shiprocket_shipment_id: '12345', awb_code: 'AWB-12345' }); } },
    inventoryRepository: { async releaseStock() { released = true; } },
  });

  await assert.rejects(
    useCase.execute({ orderId: 'ORD-SR-TEST', userId: 'patient-1' }),
    /shipment already exists/i,
  );
  assert.equal(released, false);
});
