import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';

test('Cart Module - Clean Architecture Tests', async (t) => {
  const container = createContainer();
  const testUserId = 'test_user_777';

  await t.test('getCart returns empty cart initially with zero totals', async () => {
    const { getCartUseCase } = container.useCases;
    const cart = await getCartUseCase.execute(testUserId);

    assert.equal(cart.userId, testUserId);
    assert.ok(Array.isArray(cart.items));
    assert.equal(cart.items.length, 0);
    assert.equal(cart.subtotal, 0);
    assert.equal(cart.discount, 0);
    assert.equal(cart.total, 0);
  });

  await t.test('addToCartUseCase adds product and supply plan to cart', async () => {
    const { addToCartUseCase } = container.useCases;
    const cart = await addToCartUseCase.execute({
      userId: testUserId,
      productId: 'follicle-booster-serum',
      planTitle: '1 Month',
      quantity: 1,
    });

    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].productId, 'follicle-booster-serum');
    assert.equal(cart.items[0].quantity, 1);
    assert.equal(cart.subtotal, 1299);
    assert.equal(cart.total, 1299);
  });

  await t.test('updateCartItemUseCase updates item quantity and recalculates totals', async () => {
    const { updateCartItemUseCase } = container.useCases;
    const itemId = 'follicle-booster-serum::1 Month';
    const cart = await updateCartItemUseCase.execute({
      userId: testUserId,
      itemId,
      quantity: 2,
    });

    assert.equal(cart.items[0].quantity, 2);
    assert.equal(cart.subtotal, 2598);
    assert.equal(cart.total, 2598);
  });

  await t.test('applyCouponUseCase applies FIRSTDR coupon discount', async () => {
    const { applyCouponUseCase } = container.useCases;
    const cart = await applyCouponUseCase.execute({
      userId: testUserId,
      code: 'FIRSTDR',
    });

    assert.equal(cart.coupon_code, 'FIRSTDR');
    assert.equal(cart.discount, 200);
    assert.equal(cart.total, 2398); // 2598 - 200
  });

  await t.test('removeCartItemUseCase removes item and updates totals', async () => {
    const { removeCartItemUseCase } = container.useCases;
    const itemId = 'follicle-booster-serum::1 Month';
    const cart = await removeCartItemUseCase.execute({
      userId: testUserId,
      itemId,
    });

    assert.equal(cart.items.length, 0);
    assert.equal(cart.subtotal, 0);
    assert.equal(cart.total, 0);
  });

  await t.test('clearCartUseCase clears cart completely', async () => {
    const { addToCartUseCase, clearCartUseCase } = container.useCases;
    await addToCartUseCase.execute({
      userId: testUserId,
      productId: 'clinical-scalp-detox-shampoo',
      quantity: 1,
    });

    const cleared = await clearCartUseCase.execute(testUserId);
    assert.equal(cleared.items.length, 0);
    assert.equal(cleared.subtotal, 0);
  });
});
