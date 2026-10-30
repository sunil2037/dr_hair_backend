import multer from 'multer';
import { BadRequestError } from '../errors/index.js';
import { CloudinaryMediaStorage } from '../../modules/media/infrastructure/CloudinaryMediaStorage.js';
import { config } from '../../config/env.js';

const allowedMediaMimeTypes = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
]);

const mediaUpload = multer({
  storage: new CloudinaryMediaStorage(),
  limits: { fileSize: config.upload.maxMediaFileSize, files: 5 },
  fileFilter(_req, file, callback) {
    if (!allowedMediaMimeTypes.has(file.mimetype)) {
      callback(new BadRequestError('Unsupported media type. Upload a JPEG, PNG, WebP, GIF, AVIF, MP4, MOV, M4V, or WebM file.'));
      return;
    }
    callback(null, true);
  },
});

export const uploadMediaFiles = mediaUpload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 5 },
]);
