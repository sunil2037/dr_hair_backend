import { Transform } from 'node:stream';
import { BadRequestError, PayloadTooLargeError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';
import { getCloudinaryClient } from './CloudinaryVideoStorage.js';

const mediaPurposes = new Set(['general', 'profile', 'assessment', 'progress', 'content']);

export class CloudinaryMediaStorage {
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
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          folder,
          overwrite: false,
          unique_filename: true,
        },
        (error, result) => {
          if (error) return finish(error);
          finish(null, {
            publicId: result.public_id,
            secureUrl: result.secure_url,
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
