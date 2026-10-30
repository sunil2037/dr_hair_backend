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
          format: result.format,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });

export class CloudinaryImageStorage {
  async uploadImage(buffer, subfolder, publicId) {
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
      ...(publicId ? { public_id: publicId } : {}),
    };
    return uploadBuffer(buffer, options);
  }
}
