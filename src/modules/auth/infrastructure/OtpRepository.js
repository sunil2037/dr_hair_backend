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
          $set: {
            login: otpEntity.login,
            otpHash: otpEntity.otpHash,
            expiresAt: otpEntity.expiresAt,
            type: otpEntity.type,
            attempts: 0,
          },
          $unset: { otp: 1 },
        },
        { upsert: true, new: true, runValidators: true },
      );
      return otpEntity;
    }
    store.otps.set(otpEntity.login, {
      login: otpEntity.login,
      otpHash: otpEntity.otpHash,
      expiresAt: otpEntity.expiresAt,
      type: otpEntity.type,
    });
    return otpEntity;
  }

  async findByLogin(login) {
    if (isMongoConnected()) {
      const record = await OtpModel.findOne({ login }).select('+otpHash').lean();
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

  async verifyAndConsume(login, codeHash, maxAttempts = 5) {
    const now = new Date();
    if (isMongoConnected()) {
      const record = await OtpModel.findOne({ login }).select('+otpHash').lean();
      if (!record || record.expiresAt <= now) {
        if (record) await OtpModel.deleteOne({ login, otpHash: record.otpHash });
        return { status: 'expired' };
      }

      const otp = new Otp(record);
      if (otp.isValid(codeHash)) {
        const consumed = await OtpModel.deleteOne({ login, otpHash: record.otpHash, expiresAt: { $gt: now } });
        return consumed.deletedCount === 1 ? { status: 'valid' } : { status: 'expired' };
      }

      const updated = await OtpModel.findOneAndUpdate(
        { login, otpHash: record.otpHash, expiresAt: { $gt: now }, attempts: { $lt: maxAttempts } },
        { $inc: { attempts: 1 } },
        { new: true },
      ).select('attempts').lean();
      if (!updated) {
        await OtpModel.deleteOne({ login, otpHash: record.otpHash, attempts: { $gte: maxAttempts } });
        return { status: 'expired' };
      }
      if (updated.attempts >= maxAttempts) {
        await OtpModel.deleteOne({ login, otpHash: record.otpHash });
        return { status: 'locked' };
      }
      return { status: 'invalid', attemptsRemaining: maxAttempts - updated.attempts };
    }

    const record = store.otps.get(login);
    if (!record || new Date(record.expiresAt) <= now) {
      store.otps.delete(login);
      return { status: 'expired' };
    }
    const otp = new Otp(record);
    if (otp.isValid(codeHash)) {
      store.otps.delete(login);
      return { status: 'valid' };
    }
    record.attempts = (Number(record.attempts) || 0) + 1;
    if (record.attempts >= maxAttempts) {
      store.otps.delete(login);
      return { status: 'locked' };
    }
    return { status: 'invalid', attemptsRemaining: maxAttempts - record.attempts };
  }
}

