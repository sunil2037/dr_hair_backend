import { Transform } from 'node:stream';
import { BadRequestError, NotFoundError, PayloadTooLargeError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { getCloudinaryClient } from './CloudinaryVideoStorage.js';

const mediaPurposes = new Set(['general', 'profile', 'assessment', 'progress', 'content']);

export class CloudinaryMediaStorage {
  async deleteOwnedOrphan({ publicId, resourceType, ownerId, isAdmin }) {
    if (!['image', 'video'].includes(resourceType) || typeof publicId !== 'string' || !publicId.trim() || publicId.length > 240 || publicId.includes('..')) {
      throw new BadRequestError('Provide a valid uploaded media public_id and resource_type.');
    }
    const root = resourceType === 'video' ? config.cloudinary.videoFolder : config.cloudinary.imageFolder;
    const owner = isAdmin ? 'admin' : `user-${Number(ownerId)}`;
    const expectedPrefix = `${String(root).replace(/^\/+|\/+$/g, '')}/${owner}/general/`;
    if (!publicId.startsWith(expectedPrefix)) {
      throw new BadRequestError('Only unattached media from your general upload folder can be deleted here.');
    }

    const cloudinary = getCloudinaryClient();
    let asset;
    try {
      asset = await cloudinary.api.resource(publicId, { resource_type: resourceType, type: 'upload' });
    } catch (error) {
      if (error?.http_code === 404 || error?.error?.http_code === 404) throw new NotFoundError('Uploaded media was not found.');
      throw error;
    }
    if (asset.public_id !== publicId || asset.type !== 'upload') {
      throw new BadRequestError('The uploaded asset does not match the requested media.');
    }
    const deleted = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'upload', invalidate: true });
    if (deleted.result !== 'ok') throw new Error('Cloudinary did not confirm media deletion.');
    return deleted;
  }

  _handleFile(req, file, callback) {
    const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const purposeHeader = req.headers['x-media-purpose'];
    const purpose = typeof purposeHeader === 'string' ? purposeHeader.trim().toLowerCase() : 'general';
    if (!mediaPurposes.has(purpose)) {
      callback(new BadRequestError('X-Media-Purpose must be general, profile, assessment, progress, or content.'));
      return;
    }
    if (purpose === 'profile' && resourceType !== 'image') {
      callback(new BadRequestError('Profile media must be an image.'));
      return;
    }
    if (purpose === 'progress' && resourceType !== 'image') {
      callback(new BadRequestError('Progress check-ins only accept images.'));
      return;
    }

    let folder;
    const isAdmin = ['admin', 'super_admin'].includes(req.user?.role);
    if (purpose === 'profile' && !isAdmin) {
      folder = `${config.cloudinary.imageFolder}/profiles/user-${req.user.id}`;
    } else {
      const root = resourceType === 'video' ? config.cloudinary.videoFolder : config.cloudinary.imageFolder;
      const owner = isAdmin ? 'admin' : `user-${req.user.id}`;
      folder = `${root}/${owner}/${purpose}`;
    }

    const maxBytes = resourceType === 'video'
      ? config.upload.maxMediaFileSize
      : config.upload.maxFileSize;
    let bytes = 0;
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      callback(error, result);
    };

    try {
      const cloudinary = getCloudinaryClient();
      const privateClinicalImage = resourceType === 'image' && ['assessment', 'progress'].includes(purpose);
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          ...(privateClinicalImage ? { type: 'authenticated' } : {}),
          folder,
          overwrite: false,
          unique_filename: true,
        },
        (error, result) => {
          if (error) return finish(error);
          finish(null, {
            publicId: result.public_id,
            secureUrl: privateClinicalImage
              ? cloudinary.utils.private_download_url(result.public_id, result.format, {
                resource_type: 'image',
                type: 'authenticated',
                expires_at: Math.floor(Date.now() / 1000) + 300,
                attachment: false,
              })
              : result.secure_url,
            storageUrl: result.secure_url,
            purpose,
            deliveryType: privateClinicalImage ? 'authenticated' : 'upload',
            resourceType,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
            duration: result.duration,
          });
        },
      );
      const sizeGuard = new Transform({
        transform(chunk, encoding, next) {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            next(new PayloadTooLargeError(`${resourceType === 'video' ? 'Video' : 'Image'} exceeds the configured upload size limit.`));
            return;
          }
          next(null, chunk);
        },
      });
      sizeGuard.on('error', (error) => {
        uploadStream.destroy();
        finish(error);
      });
      file.stream.on('limit', () => {
        uploadStream.destroy();
        finish(new PayloadTooLargeError('Media file exceeds the configured upload size limit.'));
      });
      file.stream.pipe(sizeGuard).pipe(uploadStream);
    } catch (error) {
      finish(error);
    }
  }

  _removeFile(_req, file, callback) {
    if (!file.publicId) return callback(null);
    getCloudinaryClient().uploader.destroy(file.publicId, { resource_type: file.resourceType })
      .then(() => callback(null))
      .catch(callback);
  }
}
