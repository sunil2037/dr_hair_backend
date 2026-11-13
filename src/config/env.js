import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env located at project root (if exists)
try {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
} catch {
  // Ignore in serverless/production environments where .env is absent
}

const environment = (process.env.NODE_ENV || 'production').trim().toLowerCase();
// Never enable local OTP behavior or expose test codes on a deployed Vercel
// environment, including Preview deployments.
const isVercelDeployment = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
const isLocalDevelopment = environment === 'development' && !isVercelDeployment;
const isProduction = environment === 'production' || isVercelDeployment;

const configuredJwtSecret = process.env.JWT_SECRET?.trim() || '';
const configuredMongoUri = process.env.MONGODB_URI?.trim() || '';
const configuredSuperAdminId = process.env.SUPER_ADMIN_ID?.trim().toLowerCase() || '';
const configuredSuperAdminPasswordHash = process.env.SUPER_ADMIN_PASSWORD_HASH?.trim() || '';
const configuredSuperAdminName = process.env.SUPER_ADMIN_NAME?.trim() || '';

// Production Configuration Validation:
// In production, reject startup if any critical production secret is absent.
if (isProduction) {
  const missing = [];
  if (!configuredJwtSecret) missing.push('JWT_SECRET');
  if (!configuredMongoUri) missing.push('MONGODB_URI');
  if (!configuredSuperAdminId) missing.push('SUPER_ADMIN_ID');
  if (!configuredSuperAdminPasswordHash) missing.push('SUPER_ADMIN_PASSWORD_HASH');
  if (!configuredSuperAdminName) missing.push('SUPER_ADMIN_NAME');
  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Production startup blocked. Missing required production environment variables: ${missing.join(', ')}`
    );
  }
}

// Development/testing fallback values only (never used in production). OTP
// delivery has no fallback: every environment must use the SMS provider.
const jwtSecret = configuredJwtSecret || (isLocalDevelopment || environment === 'test'
  ? 'dev-local-drhair-jwt-secret-key-32-chars-minimum-security'
  : '');
const superAdminId = configuredSuperAdminId || (isLocalDevelopment || environment === 'test'
  ? 'dr.hair@admin'
  : '');
const superAdminPasswordHash = configuredSuperAdminPasswordHash || (isLocalDevelopment || environment === 'test'
  ? 'scrypt$16384$8$1$L1HToB6BXk92naHi-DiXEQ$FmjhFE_je15CM3_sJ8XmwI-NABF0KpNR34o5hQVNWeXxp9d1IFsI-UrV3Q1bfUwduxV_i98uh_ZDhmsjbflv9w'
  : '');
const superAdminName = configuredSuperAdminName || (isLocalDevelopment || environment === 'test'
  ? 'Dr. Hair Super Admin'
  : '');

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a unique value of at least 32 characters.');
}

export const config = {
  env: environment,
  isDev: isLocalDevelopment || environment === 'test',
  port: parseInt(process.env.PORT, 10) || 5001,
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 5001}`,
  
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
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

  googleAuth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || '',
  },
  
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10,
  },

  smsProvider: process.env.SMS_PROVIDER?.trim().toLowerCase() || '2factor',

  twoFactor: {
    apiKey:
      process.env.TWOFACTOR_API_KEY?.trim() ||
      process.env.TWO_FACTOR_API_KEY?.trim() ||
      process.env.FAST2SMS_API_KEY?.trim() ||
      '',
    templateName: process.env.TWOFACTOR_TEMPLATE_NAME?.trim() || '',
  },

  fast2sms: {
    apiKey: process.env.FAST2SMS_API_KEY?.trim() || '',
    route: process.env.FAST2SMS_ROUTE?.trim() || 'otp',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY?.trim() || '',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  },
};
