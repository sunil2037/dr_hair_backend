import crypto from 'node:crypto';
import { isMongoConnected as isDbConnected } from '../../../shared/database/mongodb.js';
import { SessionModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';

export class SessionRepository {
  _hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  async create({
    userId,
    userType = 'patient',
    refreshToken = null,
    deviceMetadata = {},
    expiresInMs = 30 * 24 * 60 * 60 * 1000, // 30 days default
  }) {
    const sessionId = `ses_${crypto.randomBytes(16).toString('hex')}`;
    const token = refreshToken || crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = this._hashToken(token);
    const expiresAt = new Date(Date.now() + expiresInMs);

    const record = {
      sessionId,
      userId: String(userId),
      userType,
      refreshTokenHash,
      deviceMetadata: {
        platform: deviceMetadata.platform || 'unknown',
        userAgent: deviceMetadata.userAgent || '',
        ip: deviceMetadata.ip || '',
        deviceId: deviceMetadata.deviceId || '',
      },
      expiresAt,
      revokedAt: null,
      revokedReason: null,
      rotatedAt: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (isDbConnected()) {
      await SessionModel.create(record);
    } else {
      store.sessions.push({ ...record });
    }

    return {
      sessionId,
      refreshToken: token,
      expiresAt,
      userType,
      userId: String(userId),
    };
  }

  async findActive(sessionId) {
    if (!sessionId) return null;
    const now = new Date();

    if (isDbConnected()) {
      const doc = await SessionModel.findOne({
        sessionId,
        revokedAt: null,
        expiresAt: { $gt: now },
      }).lean();
      return doc || null;
    }

    const session = store.sessions.find(
      (s) => s.sessionId === sessionId && !s.revokedAt && new Date(s.expiresAt) > now,
    );
    return session ? { ...session } : null;
  }

  async verifyAndRotate({ sessionId, refreshToken, newExpiresInMs = 30 * 24 * 60 * 60 * 1000 }) {
    if (!sessionId || !refreshToken) return null;
    const session = await this.findActive(sessionId);
    if (!session) return null;

    const incomingHash = this._hashToken(refreshToken);
    if (incomingHash !== session.refreshTokenHash) {
      // Possible token reuse attack - immediately revoke session
      await this.revoke(sessionId, 'TOKEN_REUSE_DETECTED');
      return null;
    }

    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const newHash = this._hashToken(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + newExpiresInMs);
    const now = new Date();

    if (isDbConnected()) {
      await SessionModel.updateOne(
        { sessionId },
        {
          $set: {
            refreshTokenHash: newHash,
            rotatedAt: now,
            expiresAt: newExpiresAt,
            updated_at: now,
          },
        },
      );
    } else {
      const idx = store.sessions.findIndex((s) => s.sessionId === sessionId);
      if (idx !== -1) {
        store.sessions[idx].refreshTokenHash = newHash;
        store.sessions[idx].rotatedAt = now;
        store.sessions[idx].expiresAt = newExpiresAt;
        store.sessions[idx].updated_at = now;
      }
    }

    return {
      sessionId,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      userId: session.userId,
      userType: session.userType,
    };
  }

  async revoke(sessionId, reason = 'LOGOUT') {
    if (!sessionId) return false;
    const now = new Date();

    if (isDbConnected()) {
      const res = await SessionModel.updateOne(
        { sessionId, revokedAt: null },
        { $set: { revokedAt: now, revokedReason: reason, updated_at: now } },
      );
      return res.modifiedCount > 0;
    }

    const session = store.sessions.find((s) => s.sessionId === sessionId);
    if (session && !session.revokedAt) {
      session.revokedAt = now;
      session.revokedReason = reason;
      session.updated_at = now;
      return true;
    }
    return false;
  }

  async revokeAllForUser(userId, reason = 'ACCOUNT_SUSPENDED') {
    if (!userId) return 0;
    const now = new Date();
    const uid = String(userId);

    if (isDbConnected()) {
      const res = await SessionModel.updateMany(
        { userId: uid, revokedAt: null },
        { $set: { revokedAt: now, revokedReason: reason, updated_at: now } },
      );
      return res.modifiedCount;
    }

    let count = 0;
    for (const session of store.sessions) {
      if (session.userId === uid && !session.revokedAt) {
        session.revokedAt = now;
        session.revokedReason = reason;
        session.updated_at = now;
        count++;
      }
    }
    return count;
  }
}
