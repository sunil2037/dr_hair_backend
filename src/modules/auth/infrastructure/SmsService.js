import { logger } from '../../../shared/utils/logger.js';

export class SmsService {
  /**
   * Sends OTP to phone/email
   * In development/staging, logs to console and returns true
   */
  async sendOtp(destination, otpCode) {
    logger.info(`[SMS/Email Gateway] Sending OTP ${otpCode} to ${destination}`);
    // Ready for 3rd party integration (e.g. Twilio, MSG91, SendGrid)
    return true;
  }
}

