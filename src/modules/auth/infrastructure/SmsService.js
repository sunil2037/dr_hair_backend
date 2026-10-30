import { logger } from '../../../shared/utils/logger.js';
import { config } from '../../../config/env.js';

export class SmsService {
  /**
   * Sends OTP to phone/email
   * Logs the OTP and returns true (can be plugged into Twilio/Fast2SMS if needed)
   */
  async sendOtp(destination, otpCode) {
    logger.info(`[OTP Delivery] Sending OTP ${otpCode} to ${destination}`);
    return true;
  }
}

