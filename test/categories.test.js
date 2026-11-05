import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

describe('Categories Endpoints', () => {
  it('returns all platform categories from /api/v1/categories', async () => {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/categories`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert(body.data.products && Array.isArray(body.data.products));
      assert(body.data.videos && Array.isArray(body.data.videos));
      assert(body.data.services && Array.isArray(body.data.services));
      assert(body.data.concerns && Array.isArray(body.data.concerns));

      // Validate product category structure
      const allProductCat = body.data.products.find((c) => c.id === 'all');
      assert(allProductCat);
      assert.equal(allProductCat.slug, 'all');
      assert.equal(typeof allProductCat.item_count, 'number');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('filters by type=products on /api/v1/categories?type=products', async () => {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/categories?type=products`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert(body.data.products);
      assert.equal(body.data.videos, undefined);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns product categories directly on /api/v1/products/categories', async () => {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/products/categories`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert(Array.isArray(body.data));
      assert(body.data.length > 0);
      const hairCat = body.data.find((c) => c.id === 'hair');
      assert(hairCat);
      assert.equal(hairCat.name, 'Hair Fall & Regrowth');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns video categories on /api/v1/videos/categories', async () => {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/videos/categories`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert(Array.isArray(body.data));
      assert(body.data.length > 0);
      assert(body.data.some((c) => c.id === 'hair_fall'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

