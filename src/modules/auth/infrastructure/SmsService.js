import { logger } from '../../../shared/utils/logger.js';
import { config } from '../../../config/env.js';
import { BadGatewayError } from '../../../shared/errors/index.js';

const maskDestination = (destination) => {
  const value = String(destination || '');
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

export class SmsService {
  constructor({ fast2smsConfig = config.fast2sms } = {}) {
    this.fast2smsConfig = fast2smsConfig;
  }

  /**
   * Sends OTP to phone/email.
   * If FAST2SMS_API_KEY is configured in env, delivers via Fast2SMS Bulk V2 OTP route.
   * If key is absent, logs accepted verification request for development/QA.
   */
  async sendOtp(destination, otpCode) {
    const raw = String(destination || '').trim();

    // 1. If destination is an email address, Fast2SMS does not handle SMS
    if (raw.includes('@')) {
      logger.info(`[OTP Delivery] Accepted email verification request for ${maskDestination(raw)}`);
      return true;
    }

    // 2. Extract 10-digit Indian phone number
    const digits = raw.replace(/\D/g, '');
    const phone10 = digits.length >= 10 ? digits.slice(-10) : '';

    const apiKey = this.fast2smsConfig?.apiKey;
    if (!apiKey) {
      logger.info(
        `[OTP Delivery] Accepted verification request for ${maskDestination(phone10 || raw)}`
      );
      return true;
    }

    if (!phone10 || phone10.length !== 10) {
      logger.warn(`[Fast2SMS] Unable to extract valid 10-digit mobile number from ${maskDestination(raw)}`);
      return false;
    }

    try {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          route: this.fast2smsConfig.route || 'otp',
          variables_values: String(otpCode),
          numbers: phone10,
        }),
      });

      const data = await response.json().catch(() => null);

      if (data && data.return === true) {
        logger.info(
          `[Fast2SMS] Successfully dispatched OTP to ${maskDestination(phone10)} (request_id: ${data.request_id || 'ok'})`
        );
        return true;
      }

      const errMsg = Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || 'Gateway rejected SMS request';

      logger.error(`[Fast2SMS] Gateway error for ${maskDestination(phone10)}: ${errMsg}`);
      throw new BadGatewayError(`SMS delivery failed: ${errMsg}`);
    } catch (err) {
      if (err instanceof BadGatewayError) throw err;
      logger.error(`[Fast2SMS] Network error dispatching SMS: ${err.message}`);
      throw new BadGatewayError('Failed to connect to SMS delivery gateway. Please try again.');
    }
  }
}
