import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

describe('Performance Headers & Optimization Middleware', () => {
  it('sets public Edge CDN and client cache headers on read-heavy public endpoints', async () => {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const endpoints = [
        { path: '/services', expected: 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200' },
        { path: '/api/v1/services', expected: 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200' },
        { path: '/api/v1/appointments/closed-dates', expected: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
        { path: '/api/v1/app/config', expected: 'public, max-age=60, s-maxage=120, stale-while-revalidate=300' },
        { path: '/api/v1/categories', expected: 'public, max-age=120, s-maxage=300, stale-while-revalidate=600' },
        { path: '/api/v1/products', expected: 'public, max-age=30, s-maxage=60, stale-while-revalidate=120' },
        { path: '/api/v1/videos', expected: 'public, max-age=30, s-maxage=60, stale-while-revalidate=120' },
        { path: '/api/v1/content', expected: 'public, max-age=60, s-maxage=120, stale-while-revalidate=300' },
      ];

      for (const ep of endpoints) {
        const res = await fetch(`http://127.0.0.1:${port}${ep.path}`);
        assert.equal(res.status, 200, `Expected 200 for ${ep.path}`);
        assert.equal(
          res.headers.get('cache-control'),
          ep.expected,
          `Expected cache-control header for ${ep.path}`,
        );
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('compresses payloads exceeding the 1024-byte compression threshold with gzip or brotli', async () => {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const resGzip = await fetch(`http://127.0.0.1:${port}/api/v1/products`, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      assert.equal(resGzip.status, 200);
      assert.equal(resGzip.headers.get('content-encoding'), 'gzip');

      const resBr = await fetch(`http://127.0.0.1:${port}/api/v1/products`, {
        headers: { 'Accept-Encoding': 'br' },
      });
      assert.equal(resBr.status, 200);
      assert.equal(resBr.headers.get('content-encoding'), 'br');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
