import { logger } from '../../../shared/utils/logger.js';
import { config } from '../../../config/env.js';
import { BadGatewayError, ServiceUnavailableError } from '../../../shared/errors/index.js';

const maskDestination = (destination) => {
  const value = String(destination || '');
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

export class SmsService {
  constructor(options = {}) {
    const hasFast2sms = 'fast2smsConfig' in options;
    const hasTwoFactor = 'twoFactorConfig' in options;

    this.twoFactorConfig = options.twoFactorConfig || (hasFast2sms && !hasTwoFactor ? { apiKey: '' } : config.twoFactor);
    this.fast2smsConfig = options.fast2smsConfig || config.fast2sms;

    if (options.provider) {
      this.provider = options.provider;
    } else if (hasFast2sms && !hasTwoFactor) {
      this.provider = 'fast2sms';
    } else if (hasTwoFactor && !hasFast2sms) {
      this.provider = '2factor';
    } else if (config.smsProvider === '2factor' || this.twoFactorConfig?.apiKey) {
      this.provider = '2factor';
    } else {
      this.provider = 'fast2sms';
    }
  }

  /**
   * Sends OTP through 2Factor.in (primary) or Fast2SMS (fallback).
   */
  async sendOtp(destination, otpCode) {
    const raw = String(destination || '').trim();

    // OTP is SMS-only in every environment.
    if (raw.includes('@')) {
      throw new ServiceUnavailableError('Email OTP delivery is not configured. SMS OTP requires a phone number.');
    }

    // Extract 10-digit Indian phone number
    const digits = raw.replace(/\D/g, '');
    const phone10 = digits.length >= 10 ? digits.slice(-10) : '';

    if (!phone10 || phone10.length !== 10) {
      logger.warn(`[SmsService] Unable to extract valid 10-digit mobile number from ${maskDestination(raw)}`);
      throw new BadGatewayError('SMS delivery failed: invalid phone number.');
    }

    if (this.provider === 'fast2sms') {
      return this._sendFast2Sms(phone10, otpCode);
    }

    return this._send2Factor(phone10, otpCode);
  }

  async _send2Factor(phone10, otpCode) {
    const apiKey = this.twoFactorConfig?.apiKey;
    if (!apiKey) {
      throw new ServiceUnavailableError(
        'OTP delivery unavailable. Configure TWOFACTOR_API_KEY for this environment.',
      );
    }

    const internationalPhone = `+91${phone10}`;
    const template = this.twoFactorConfig.templateName ? `/${encodeURIComponent(this.twoFactorConfig.templateName)}` : '';
    const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/${encodeURIComponent(internationalPhone)}/${encodeURIComponent(otpCode)}${template}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const data = await response.json().catch(() => null);

      if (data && String(data.Status || '').toLowerCase() === 'success') {
        logger.info(
          `[2Factor] Successfully dispatched OTP to ${maskDestination(phone10)} (session: ${data.Details || 'ok'})`
        );
        return true;
      }

      const errMsg = data?.Details || data?.message || 'Gateway rejected SMS request';
      logger.error(`[2Factor] Gateway error for ${maskDestination(phone10)}: ${errMsg}`);
      throw new BadGatewayError(`SMS delivery failed: ${errMsg}`);
    } catch (err) {
      if (err instanceof BadGatewayError || err instanceof ServiceUnavailableError) throw err;
      logger.error(`[2Factor] Network error dispatching SMS: ${err.message}`);
      throw new BadGatewayError('Failed to connect to SMS delivery gateway. Please try again.');
    }
  }

  async _sendFast2Sms(phone10, otpCode) {
    const apiKey = this.fast2smsConfig?.apiKey;
    if (!apiKey) {
      throw new ServiceUnavailableError(
        'OTP delivery unavailable. Configure FAST2SMS_API_KEY for this environment.',
      );
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
          route: this.fast2smsConfig?.route || 'otp',
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
      if (err instanceof BadGatewayError || err instanceof ServiceUnavailableError) throw err;
      logger.error(`[Fast2SMS] Network error dispatching SMS: ${err.message}`);
      throw new BadGatewayError('Failed to connect to SMS delivery gateway. Please try again.');
    }
  }
}
