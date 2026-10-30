import { IOtpRepository } from '../domain/IOtpRepository.js';
import { Otp } from '../domain/Otp.js';
import { store } from '../../../shared/database/store.js';

export class OtpRepository extends IOtpRepository {
  async save(otpEntity) {
    store.otps.set(otpEntity.login, {
      login: otpEntity.login,
      otp: otpEntity.otp,
      expiresAt: otpEntity.expiresAt,
      type: otpEntity.type,
    });
    return otpEntity;
  }

  async findByLogin(login) {
    const record = store.otps.get(login);
    if (!record) return null;
    return new Otp(record);
  }

  async delete(login) {
    return store.otps.delete(login);
  }
}

