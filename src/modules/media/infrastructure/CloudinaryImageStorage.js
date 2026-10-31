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
}
