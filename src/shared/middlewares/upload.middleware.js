import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../../config/env.js';
import { BadRequestError } from '../errors/index.js';

// Ensure upload directories exist
const profilesDir = path.join(config.upload.baseDir, 'profiles');
const scalpDir = path.join(config.upload.baseDir, 'scalp');

[config.upload.baseDir, profilesDir, scalpDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage engine generator
const createStorage = (targetSubdir) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(config.upload.baseDir, targetSubdir);
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
      cb(null, `${cleanName || 'file'}_${uniqueSuffix}${ext}`);
    },
  });
};

const fileFilter = (req, file, cb) => {
  if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError(`Invalid file format '${file.mimetype}'. Allowed: JPEG, PNG, WEBP`));
  }
};

// Multer upload instances
export const uploadProfile = multer({
  storage: createStorage('profiles'),
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter,
});

export const uploadScalpPhotos = multer({
  storage: createStorage('scalp'),
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter,
});

// Generic multipart form data parser without files (for text-only FormData)
export const parseFormData = multer().none();

