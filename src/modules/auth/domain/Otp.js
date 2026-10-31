import { timingSafeEqual } from 'node:crypto';

/**
 * OTP Domain Entity
 */
export class Otp {
  constructor({ login, otpHash, expiresAt, attempts = 0, type = 'login' }) {
    this.login = login;
    this.otpHash = otpHash;
    this.expiresAt = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    this.type = type; // 'login' or 'register'
    this.attempts = Number(attempts) || 0;
  }

  isExpired() {
    return new Date() > this.expiresAt;
  }

  isValid(codeHash) {
    if (
      this.isExpired()
      || typeof this.otpHash !== 'string'
      || typeof codeHash !== 'string'
    ) {
      return false;
    }

    const stored = Buffer.from(this.otpHash, 'hex');
    const candidate = Buffer.from(codeHash, 'hex');
    return stored.length === candidate.length
      && stored.length > 0
      && timingSafeEqual(stored, candidate);
  }
}

