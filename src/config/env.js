import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env located at project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const environment = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET?.trim();
const defaultTestOtp = process.env.DEFAULT_TEST_OTP?.trim() || '';
const superAdminId = process.env.SUPER_ADMIN_ID?.trim().toLowerCase() || '';
const superAdminPasswordHash = process.env.SUPER_ADMIN_PASSWORD_HASH?.trim() || '';

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a unique value of at least 32 characters.');
}

if (defaultTestOtp && !/^\d{6}$/.test(defaultTestOtp)) {
  throw new Error('DEFAULT_TEST_OTP must contain exactly 6 digits when configured.');
}

if (Boolean(superAdminId) !== Boolean(superAdminPasswordHash)) {
  throw new Error('SUPER_ADMIN_ID and SUPER_ADMIN_PASSWORD_HASH must be configured together.');
}

export const config = {
  env: environment,
  isDev: environment === 'development',
  port: parseInt(process.env.PORT, 10) || 5001,
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 5001}`,
  
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  },

  mongodb: {
    uri: process.env.MONGODB_URI?.trim() || '',
  },

  admin: {
    superAdminId,
    superAdminPasswordHash,
    superAdminName: process.env.SUPER_ADMIN_NAME?.trim() || 'Dr. Hair Super Admin',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  
  upload: {
    maxFileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024,
    maxMediaFileSize: (parseInt(process.env.MAX_MEDIA_FILE_SIZE_MB, 10) || 100) * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || '',
    apiKey: process.env.CLOUDINARY_API_KEY?.trim() || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || '',
    imageFolder: process.env.CLOUDINARY_IMAGE_FOLDER?.trim() || 'drhair/images',
    videoFolder: process.env.CLOUDINARY_VIDEO_FOLDER?.trim() || 'drhair/testing',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID?.trim() || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim() || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() || '',
  },
  
  otp: {
    defaultOtp: defaultTestOtp,
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10,
  },
};

