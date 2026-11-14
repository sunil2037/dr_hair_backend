import test from 'node:test';
import assert from 'node:assert/strict';
import { ShiprocketService } from '../src/modules/commerce/infrastructure/ShiprocketService.js';

test('Shiprocket tracking uses sandbox credentials and normalizes courier scan events', async (t) => {
  const envKeys = [
    'NODE_ENV',
    'SHIPROCKET_API_ENV',
    'SHIPROCKET_API_EMAIL',
    'SHIPROCKET_API_PASSWORD',
    'SHIPROCKET_SANDBOX_API_EMAIL',
    'SHIPROCKET_SANDBOX_API_PASSWORD',
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  t.after(() => {
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
    globalThis.fetch = oldFetch;
  });

  process.env.NODE_ENV = 'development';
  delete process.env.SHIPROCKET_API_ENV;
  delete process.env.SHIPROCKET_API_EMAIL;
  delete process.env.SHIPROCKET_API_PASSWORD;
  process.env.SHIPROCKET_SANDBOX_API_EMAIL = 'tracking-test@example.invalid';
  process.env.SHIPROCKET_SANDBOX_API_PASSWORD = 'stub-password';

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method, body: options.body, headers: options.headers });
    const body = String(url).endsWith('/auth/login')
      ? { token: 'stub-sandbox-token' }
      : {
          tracking_data: {
            shipment_track: [{
              awb_code: 'AWB-TEST-1',
              courier_name: 'Sandbox Courier',
              current_status: 'IN TRANSIT',
              edd: '2026-12-01',
              origin: 'Jaipur',
              destination: 'Mumbai',
              updated_time_stamp: '2026-11-14 10:30:00',
            }],
            shipment_track_activities: [{
              date: '2026-11-14 10:30:00',
              activity: 'Shipment in transit',
              location: 'Jaipur Hub',
              'sr-status-label': 'IN TRANSIT',
            }],
            track_url: 'https://tracking.example.invalid/AWB-TEST-1',
          },
        };
    return { ok: true, json: async () => body };
  };

  const tracking = await new ShiprocketService().trackShipment({ awbCode: 'AWB-TEST-1' });

  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url.startsWith('https://api-sandbox.shiprocket.in/v1/external/')));
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[1].headers.Authorization, 'Bearer stub-sandbox-token');
  assert.equal(tracking.current_status, 'IN TRANSIT');
  assert.equal(tracking.courier, 'Sandbox Courier');
  assert.equal(tracking.estimated_delivery, '2026-12-01');
  assert.deepEqual(tracking.events, [{
    date: '2026-11-14 10:30:00',
    status: 'IN TRANSIT',
    activity: 'Shipment in transit',
    location: 'Jaipur Hub',
  }]);
  assert.equal('consignee_name' in tracking, false);
});
