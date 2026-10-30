import multer from 'multer';
import { config } from '../../config/env.js';
import { BadRequestError } from '../errors/index.js';

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSize, files: 1 },
  fileFilter(_req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      callback(new BadRequestError('Upload a PDF, JPG, PNG, or WebP report.'));
      return;
    }
    callback(null, true);
  },
});

export const uploadClinicalReportFile = reportUpload.single('file');
