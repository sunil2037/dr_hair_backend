/**
 * OTP Domain Entity
 */
export class Otp {
  constructor({ login, otp, expiresAt, type = 'login' }) {
    this.login = login;
    this.otp = otp;
    this.expiresAt = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    this.type = type; // 'login' or 'register'
  }

  isExpired() {
    return new Date() > this.expiresAt;
  }

  isValid(code) {
    return !this.isExpired() && String(this.otp) === String(code);
  }
}

