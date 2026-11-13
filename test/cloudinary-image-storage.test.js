import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CloudinaryImageStorage } from '../src/modules/media/infrastructure/CloudinaryImageStorage.js';

describe('CloudinaryImageStorage private image downloads', () => {
  it('returns a bounded base64 image payload for the Gemini request', async () => {
    const storage = new CloudinaryImageStorage({
      fetchFn: async () => ({
        ok: true,
        headers: { get: () => '4' },
        arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      }),
    });
    storage.createPrivateDownloadUrl = (publicId, format) => {
      assert.equal(publicId, 'drhair/user-12/assessment/front');
      assert.equal(format, 'jpg');
      return 'https://signed.test/private-image';
    };

    const result = await storage.downloadAuthenticatedImage(
      'drhair/user-12/assessment/front',
      'jpg',
      { maxBytes: 4 },
    );

    assert.equal(result.data, Buffer.from([1, 2, 3, 4]).toString('base64'));
    assert.equal(result.mimeType, 'image/jpeg');
  });

  it('rejects an image larger than the configured limit', async () => {
    const storage = new CloudinaryImageStorage({
      fetchFn: async () => ({
        ok: true,
        headers: { get: () => '5' },
        arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4, 5]).buffer,
      }),
    });
    storage.createPrivateDownloadUrl = () => 'https://signed.test/private-image';

    await assert.rejects(
      storage.downloadAuthenticatedImage('drhair/user-12/assessment/front', 'jpg', { maxBytes: 4 }),
      /size limit/,
    );
  });

  it('stops reading a private image stream as soon as it exceeds the limit', async () => {
    let cancelled = false;
    const storage = new CloudinaryImageStorage({
      fetchFn: async () => ({
        ok: true,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: async () => ({ done: false, value: Uint8Array.from([1, 2, 3, 4, 5]) }),
            cancel: async () => { cancelled = true; },
          }),
        },
      }),
    });
    storage.createPrivateDownloadUrl = () => 'https://signed.test/private-image';

    await assert.rejects(
      storage.downloadAuthenticatedImage('drhair/user-12/assessment/front', 'jpg', { maxBytes: 4 }),
      /size limit/,
    );
    assert.equal(cancelled, true);
  });
});
