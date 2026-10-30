import { IOtpRepository } from '../domain/IOtpRepository.js';
import { Otp } from '../domain/Otp.js';
import { store } from '../../../shared/database/store.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { OtpModel } from '../../../shared/database/models.js';

export class OtpRepository extends IOtpRepository {
  async save(otpEntity) {
    if (isMongoConnected()) {
      await OtpModel.findOneAndUpdate(
        { login: otpEntity.login },
        {
          login: otpEntity.login,
          otp: otpEntity.otp,
          expiresAt: otpEntity.expiresAt,
          type: otpEntity.type,
        },
        { upsert: true, new: true, runValidators: true },
      );
      return otpEntity;
    }
    store.otps.set(otpEntity.login, {
      login: otpEntity.login,
      otp: otpEntity.otp,
      expiresAt: otpEntity.expiresAt,
      type: otpEntity.type,
    });
    return otpEntity;
  }

  async findByLogin(login) {
    if (isMongoConnected()) {
      const record = await OtpModel.findOne({ login }).lean();
      return record ? new Otp(record) : null;
    }
    const record = store.otps.get(login);
    if (!record) return null;
    return new Otp(record);
  }

  async delete(login) {
    if (isMongoConnected()) {
      const result = await OtpModel.deleteOne({ login });
      return result.deletedCount > 0;
    }
    return store.otps.delete(login);
  }
}

