import { config } from '../../../config/env.js';
import { getCloudinaryClient } from './CloudinaryVideoStorage.js';

const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const cloudinary = getCloudinaryClient();
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', ...options },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          storageUrl: result.secure_url,
          deliveryType: options.type || 'upload',
          format: result.format,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });

export class CloudinaryImageStorage {
  constructor({ fetchFn = globalThis.fetch } = {}) {
    this.fetchFn = fetchFn;
  }

  async uploadImage(buffer, subfolder, publicId, { deliveryType = 'upload' } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('An image buffer is required for Cloudinary upload.');
    }
    const cleanFolder = String(subfolder || '')
      .replace(/[^a-zA-Z0-9/_-]/g, '')
      .replace(/^\/+|\/+$/g, '');
    const options = {
      folder: cleanFolder ? config.cloudinary.imageFolder + '/' + cleanFolder : config.cloudinary.imageFolder,
      overwrite: true,
      unique_filename: !publicId,
      type: deliveryType,
      quality: 'auto:good',
      fetch_format: 'auto',
      flags: 'strip_profile',
      width: 2048,
      height: 2048,
      crop: 'limit',
      ...(publicId ? { public_id: publicId } : {}),
    };
    return uploadBuffer(buffer, options);
  }

  async deleteImage(publicId, { deliveryType = 'upload' } = {}) {
    if (typeof publicId !== 'string' || !publicId.trim()) {
      throw new Error('A Cloudinary image public ID is required for deletion.');
    }
    return getCloudinaryClient().uploader.destroy(publicId, { resource_type: 'image', invalidate: true, type: deliveryType });
  }

  createPrivateDownloadUrl(publicId, format, { expiresInSeconds = 300 } = {}) {
    if (typeof publicId !== 'string' || !publicId.trim() || typeof format !== 'string' || !format.trim()) {
      throw new Error('A Cloudinary public ID and format are required for a private image URL.');
    }
    return getCloudinaryClient().utils.private_download_url(publicId, format, {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
      attachment: false,
    });
  }

  async getAuthenticatedImage(publicId) {
    return getCloudinaryClient().api.resource(publicId, { resource_type: 'image', type: 'authenticated' });
  }

  async downloadAuthenticatedImage(publicId, format, { maxBytes = 2 * 1024 * 1024 } = {}) {
    const downloadUrl = this.createPrivateDownloadUrl(publicId, format);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await this.fetchFn(downloadUrl, { signal: controller.signal });
      if (!response.ok) throw new Error('Private image download failed.');

      const declaredLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new Error('Private image exceeds the AI analysis size limit.');
      }

      let data;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > maxBytes) {
            await reader.cancel();
            throw new Error('Private image exceeds the AI analysis size limit.');
          }
          chunks.push(Buffer.from(value));
        }
        data = Buffer.concat(chunks, length);
      } else {
        data = Buffer.from(await response.arrayBuffer());
      }
      if (data.length === 0 || data.length > maxBytes) {
        throw new Error('Private image is empty or exceeds the AI analysis size limit.');
      }

      const mimeByFormat = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      const mimeType = mimeByFormat[String(format).toLowerCase()];
      if (!mimeType) throw new Error('Private image format is not supported for AI analysis.');

      return { data: data.toString('base64'), mimeType };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
