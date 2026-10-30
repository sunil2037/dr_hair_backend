import multer from 'multer';
import { config } from '../../config/env.js';
import { BadRequestError } from '../errors/index.js';

const fileFilter = (req, file, cb) => {
  if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('Invalid file format ' + file.mimetype + '. Allowed: JPEG, PNG, WEBP'));
  }
};

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter,
});

export const uploadProfile = memoryUpload;
export const uploadScalpPhotos = memoryUpload;

// Generic multipart form data parser without files (for text-only FormData).
export const parseFormData = multer().none();
