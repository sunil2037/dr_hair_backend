import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';

describe('Dynamic Coupons & Commerce Promotions', () => {
  const container = createContainer();
  const { couponRepository, cartRepository } = container.repositories;
  const { applyCouponUseCase } = container.useCases;

  it('lists seeded coupons', async () => {
    const result = await couponRepository.list();
    assert.ok(result.items.length >= 3);
    const firstDr = result.items.find((c) => c.code === 'FIRSTDR');
    assert.ok(firstDr);
    assert.equal(firstDr.discountValue, 200);
  });

  it('admin creates a new coupon and finds by code', async () => {
    const code = `PROMO${Date.now()}`;
    const created = await couponRepository.create({
      code,
      discount_type: 'fixed',
      discount_value: 250,
      minimum_order: 1000,
      applies_to: 'All products',
    });
    assert.equal(created.code, code);
    assert.equal(created.discountValue, 250);

    const found = await couponRepository.findByCode(code);
    assert.ok(found);
    assert.equal(found.id, created.id);
  });

  it('applies dynamic coupon via applyCouponUseCase', async () => {
    const code = `DYN${Date.now()}`;
    await couponRepository.create({
      code,
      discount_type: 'percent',
      discount_value: 20,
      minimum_order: 500,
    });

    const userId = `patient_coupon_${Date.now()}`;
    const cart = await cartRepository.getCart(userId);
    cart.addItem({
      id: 'serum-1',
      product_id: 'serum',
      title: 'Follicle Booster Serum',
      plan_title: '1 Month',
      price: 1299,
      quantity: 1,
    });
    await cartRepository.saveCart(cart);

    const appliedCart = await applyCouponUseCase.execute({ userId, code });
    assert.equal(appliedCart.coupon_code, code);
    // 20% of 1299 = 260
    assert.equal(appliedCart.discount, 260);
    assert.equal(appliedCart.total, 1299 - 260);
  });

  it('rejects dynamic coupon if minimum spend not met', async () => {
    const code = `HIGHMIN${Date.now()}`;
    await couponRepository.create({
      code,
      discount_type: 'fixed',
      discount_value: 500,
      minimum_order: 5000,
    });

    const userId = `patient_coupon_min_${Date.now()}`;
    const cart = await cartRepository.getCart(userId);
    cart.addItem({
      id: 'shampoo-1',
      product_id: 'shampoo',
      title: 'Detox Shampoo',
      price: 749,
      quantity: 1,
    });
    await cartRepository.saveCart(cart);

    await assert.rejects(
      async () => {
        await applyCouponUseCase.execute({ userId, code });
      },
      {
        message: 'Add items worth ₹5000 to use this coupon.',
      },
    );
  });

  it('admin deletes a coupon', async () => {
    const code = `DEL${Date.now()}`;
    const created = await couponRepository.create({
      code,
      discount_type: 'fixed',
      discount_value: 100,
    });
    assert.ok(created.id);

    const deleted = await couponRepository.delete(created.id);
    assert.equal(deleted, true);

    const found = await couponRepository.findByCode(code);
    assert.equal(found, null);
  });
});
