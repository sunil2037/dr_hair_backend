import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

describe('Services & Public Endpoints', () => {
  it('returns a list of clinical services for Flutter home catalog', async () => {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/services`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert(Array.isArray(data));
      assert(data.length > 0);
      assert.equal(data[0].id, 'srv_assessment');
      assert.equal(typeof data[0].title, 'string');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('provides public appointment closed dates endpoint', async () => {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/appointments/closed-dates`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert(data.status === 'success');
      assert(Array.isArray(data.data.items));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
