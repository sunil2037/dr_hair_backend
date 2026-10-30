import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env located at project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  port: parseInt(process.env.PORT, 10) || 5001,
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 5001}`,
  
  jwt: {
    secret: process.env.JWT_SECRET || 'drhair_default_dev_secret_key_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  },
  
  upload: {
    baseDir: path.resolve(__dirname, '../../uploads'),
    maxFileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
  },
  
  otp: {
    defaultOtp: process.env.DEFAULT_TEST_OTP || '123456',
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10,
  },
};

