import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { sendPushNotification } from '../infrastructure/FirebaseAdminMessaging.js';

export class NotificationController {
  constructor({ deviceTokenRepository }) {
    this.deviceTokenRepository = deviceTokenRepository;
  }

  registerDeviceToken = async (req, res, next) => {
    try {
      const userId = Number(req.user?.id);
      const { token, platform } = req.body || {};
      if (!Number.isInteger(userId) || userId <= 0) {
        throw new BadRequestError('A registered user account is required to register a device.');
      }
      if (typeof token !== 'string' || token.trim().length < 20 || token.length > 4096) {
        throw new BadRequestError('A valid Firebase device token is required.');
      }
      if (!['android', 'ios', 'web'].includes(platform)) {
        throw new BadRequestError('Platform must be android, ios, or web.');
      }

      const record = await this.deviceTokenRepository.register({
        userId,
        token: token.trim(),
        platform,
      });
      return sendSuccess(res, { message: 'Device token registered.', data: { platform: record.platform } });
    } catch (error) {
      next(error);
    }
  };

  removeDeviceToken = async (req, res, next) => {
    try {
      const userId = Number(req.user?.id);
      const { token } = req.body || {};
      if (!Number.isInteger(userId) || userId <= 0 || typeof token !== 'string') {
        throw new BadRequestError('A registered user and device token are required.');
      }
      const removed = await this.deviceTokenRepository.remove({ userId, token: token.trim() });
      return sendSuccess(res, { message: removed ? 'Device token removed.' : 'Device token was not registered.' });
    } catch (error) {
      next(error);
    }
  };

  sendToUser = async (req, res, next) => {
    try {
      const userId = Number(req.body?.user_id);
      const { title, body, data = {} } = req.body || {};
      if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestError('A valid user_id is required.');
      if (typeof title !== 'string' || !title.trim() || title.length > 120) {
        throw new BadRequestError('Notification title is required and must be at most 120 characters.');
      }
      if (typeof body !== 'string' || !body.trim() || body.length > 1000) {
        throw new BadRequestError('Notification body is required and must be at most 1000 characters.');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length > 20) {
        throw new BadRequestError('data must be an object containing no more than 20 fields.');
      }

      const tokens = await this.deviceTokenRepository.listByUserId(userId);
      if (!tokens.length) throw new NotFoundError('This user has no registered push devices.');

      const results = await Promise.all(
        tokens.map(async ({ token }) => {
          try {
            await sendPushNotification({ token, title: title.trim(), body: body.trim(), data });
            return { token, ok: true };
          } catch (error) {
            const invalidCodes = new Set([
              'messaging/registration-token-not-registered',
              'messaging/invalid-registration-token',
            ]);
            return { token, ok: false, code: error.code, invalid: invalidCodes.has(error.code) };
          }
        }),
      );
      await this.deviceTokenRepository.removeInvalidTokens(
        results.filter((result) => result.invalid).map((result) => result.token),
      );

      const sent = results.filter((result) => result.ok).length;
      return sendSuccess(res, {
        message: 'Push notification delivery attempted.',
        data: { target_user_id: userId, sent, failed: results.length - sent },
      });
    } catch (error) {
      next(error);
    }
  };
}
