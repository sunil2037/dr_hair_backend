import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { createApp } from '../src/app.js';
import { TokenService } from '../src/shared/utils/token.service.js';
import { Product } from '../src/modules/products/domain/Product.js';

test('products without review data do not receive a fabricated rating', () => {
  const product = new Product({ id: 'unrated', name: 'Unrated', category: 'Care' });
  assert.equal(product.rating, 0);
  assert.equal(product.reviews_count, 0);
});

test('Product Module - Clean Architecture Tests', async (t) => {
  const container = createContainer();
  const { app } = createApp({ container });
  const adminToken = TokenService.generateToken({ id: 1, role: 'admin', email: 'admin@drhair.com' });

  await t.test('GET /api/v1/products returns seeded products with Cloudinary images', async () => {
    const { listProductsUseCase } = container.useCases;
    const result = await listProductsUseCase.execute({ page: 1, limit: 10 });

    assert.ok(result.items.length > 0, 'Products list should not be empty');
    assert.ok(result.total >= result.items.length, 'Total should be >= returned items');

    const follicleSerum = result.items.find((p) => p.id === 'follicle-booster-serum');
    assert.ok(follicleSerum, 'Follicle Booster Serum should be in catalog');
    assert.equal(follicleSerum.name, 'Follicle Booster Serum');
    assert.ok(follicleSerum.images.length > 0, 'Product should have images');
    assert.ok(
      follicleSerum.images[0].includes('res.cloudinary.com'),
      'First image should be hosted on Cloudinary'
    );
    assert.ok(follicleSerum.supply_plans.length > 0, 'Product should have supply plans');
  });

  await t.test('filters products by root cause and category', async () => {
    const { listProductsUseCase } = container.useCases;

    // Filter by root cause 'Thyroid'
    const thyroidResult = await listProductsUseCase.execute({ rootCause: 'Thyroid' });
    assert.ok(thyroidResult.items.length > 0);
    assert.equal(thyroidResult.items[0].id, 'thyro-balance-metabolism');

    // Filter by root cause 'Dandruff'
    const dandruffResult = await listProductsUseCase.execute({ rootCause: 'Dandruff' });
    assert.ok(dandruffResult.items.length > 0);
    assert.equal(dandruffResult.items[0].id, 'clinical-scalp-detox-shampoo');

    // Filter by root cause 'Stress'
    const stressResult = await listProductsUseCase.execute({ rootCause: 'Stress' });
    assert.ok(stressResult.items.length > 0);
    assert.equal(stressResult.items[0].id, 'calm-sleep-ashwagandha');
  });

  await t.test('searches products by ingredient keyword', async () => {
    const { listProductsUseCase } = container.useCases;
    const result = await listProductsUseCase.execute({ search: 'ketoconazole' });

    assert.ok(result.items.length > 0);
    assert.equal(result.items[0].id, 'clinical-scalp-detox-shampoo');
  });

  await t.test('GET /api/v1/products/:id retrieves single product or fails with 404', async () => {
    const { getProductByIdUseCase } = container.useCases;

    const existing = await getProductByIdUseCase.execute({ id: 'follicle-booster-serum' });
    assert.ok(existing);
    assert.equal(existing.name, 'Follicle Booster Serum');

    await assert.rejects(
      async () => {
        await getProductByIdUseCase.execute({ id: 'non-existent-product-id' });
      },
      { name: 'NotFoundError' }
    );
  });

  await t.test('Admin can create, update, and delete a product', async () => {
    const { createProductUseCase, updateProductUseCase, deleteProductUseCase, getProductByIdUseCase } =
      container.useCases;

    // 1. Create Product
    const newProduct = await createProductUseCase.execute({
      name: 'Scalp Peptide Elixir',
      category: 'Targeted Peptides',
      root_causes: ['Hair', 'Stress'],
      price: 1899,
      compare_at_price: 2499,
      images: ['https://res.cloudinary.com/demo/image/upload/sample_elixir.jpg'],
      supply_plans: [
        { id: 'elixir-1m', title: '1 Month', subtitle: '50ml', price: 1899, mrp: 2499, sku: 'DRH-ELX-050' },
      ],
      benefits: [{ title: 'Peptide complex', description: 'Supports micro-circulation' }],
    });

    assert.ok(newProduct.id);
    assert.equal(newProduct.name, 'Scalp Peptide Elixir');
    assert.equal(newProduct.price, 1899);

    // 2. Update Product
    const updated = await updateProductUseCase.execute({
      id: newProduct.id,
      price: 1799,
      stock: 85,
    });
    assert.equal(updated.price, 1799);
    assert.equal(updated.stock, 85);

    // 3. Delete Product
    const delResult = await deleteProductUseCase.execute({ id: newProduct.id });
    assert.equal(delResult.success, true);

    // 4. Verify 404
    await assert.rejects(
      async () => {
        await getProductByIdUseCase.execute({ id: newProduct.id });
      },
      { name: 'NotFoundError' }
    );
  });
});
