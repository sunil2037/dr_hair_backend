import { logger } from '../../../shared/utils/logger.js';
import { config } from '../../../config/env.js';
import { AppError } from '../../../shared/errors/index.js';

const maskDestination = (destination) => {
  const value = String(destination);
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

export class SmsService {
  /**
   * Sends OTP to phone/email
   * Development stub only. A delivery provider must be configured before
   * OTP login can be enabled outside local development.
   */
  async sendOtp(destination, otpCode) {
    void otpCode;
    if (!config.isDev) {
      throw new AppError('OTP delivery is not configured for this environment.', 503);
    }
    logger.info(`[OTP Delivery] Development stub accepted request for ${maskDestination(destination)}`);
    return true;
  }
}

