import { logger } from '../../../shared/utils/logger.js';
import { config } from '../../../config/env.js';

export class SmsService {
  /**
   * Sends OTP to phone/email
  * In development, logs the test OTP to console and returns true
   */
  async sendOtp(destination, otpCode) {
    if (!config.isDev) {
      throw new Error('OTP delivery is not configured. Add an OTP API provider before production use.');
    }

    logger.info(`[Development OTP] Sending ${otpCode} to ${destination}`);
    // Development-only delivery stub; connect a provider before production use.
    return true;
  }
}

