import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { sendPushNotification } from '../infrastructure/FirebaseAdminMessaging.js';

export class NotificationController {
  constructor({ deviceTokenRepository, notificationRepository }) {
    this.deviceTokenRepository = deviceTokenRepository;
    this.notificationRepository = notificationRepository;
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

  listNotifications = async (req, res, next) => {
    try {
      const userId = Number(req.user?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        throw new BadRequestError('A registered user account is required.');
      }
      const { page, limit, unread } = req.query || {};
      const result = await this.notificationRepository.listByUserId(userId, {
        page,
        limit,
        unreadOnly: unread === 'true',
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  markAsRead = async (req, res, next) => {
    try {
      const userId = Number(req.user?.id);
      const { id } = req.params || {};
      if (!id || typeof id !== 'string') {
        throw new BadRequestError('Notification ID is required.');
      }
      const updated = await this.notificationRepository.markAsRead(id, userId);
      if (!updated) {
        throw new NotFoundError('Notification not found.');
      }
      return sendSuccess(res, { message: 'Notification marked as read.', data: updated });
    } catch (error) {
      next(error);
    }
  };

  markAllAsRead = async (req, res, next) => {
    try {
      const userId = Number(req.user?.id);
      await this.notificationRepository.markAllAsRead(userId);
      return sendSuccess(res, { message: 'All notifications marked as read.' });
    } catch (error) {
      next(error);
    }
  };

  sendToUser = async (req, res, next) => {
    try {
      const userId = Number(req.body?.user_id);
      const { title, body, type = 'general', destination = {}, data = {} } = req.body || {};
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

      const dest = {
        type: destination.type || data.destination_type || 'screen',
        screen: destination.screen || data.screen || 'home',
        entityId: destination.entityId || data.entity_id || null,
      };

      // Save notification to inbox
      let saved = null;
      if (this.notificationRepository) {
        saved = await this.notificationRepository.create({
          userId,
          title: title.trim(),
          body: body.trim(),
          type,
          destination: dest,
          data,
        });
      }

      const tokens = await this.deviceTokenRepository.listByUserId(userId);
      const pushData = {
        ...data,
        notification_id: saved?.id || '',
        destination_type: dest.type,
        ...(dest.screen ? { screen: dest.screen } : {}),
        ...(dest.entityId ? { entity_id: dest.entityId } : {}),
      };

      let sent = 0;
      let failed = 0;

      if (tokens.length > 0) {
        const results = await Promise.all(
          tokens.map(async ({ token }) => {
            try {
              await sendPushNotification({ token, title: title.trim(), body: body.trim(), data: pushData });
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
        sent = results.filter((result) => result.ok).length;
        failed = results.length - sent;
      }

      return sendSuccess(res, {
        message: 'Push notification delivery attempted.',
        data: {
          notification: saved,
          target_user_id: userId,
          tokens_count: tokens.length,
          sent,
          failed,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  broadcast = async (req, res, next) => {
    try {
      const {
        title,
        body,
        audience = 'All app users',
        type = 'announcement',
        destination = {},
        data = {},
      } = req.body || {};

      if (typeof title !== 'string' || !title.trim() || title.length > 120) {
        throw new BadRequestError('Notification title is required and must be at most 120 characters.');
      }
      if (typeof body !== 'string' || !body.trim() || body.length > 1000) {
        throw new BadRequestError('Notification body is required and must be at most 1000 characters.');
      }

      const dest = {
        type: destination.type || data.destination_type || 'screen',
        screen: destination.screen || data.screen || 'home',
        entityId: destination.entityId || data.entity_id || null,
      };

      // Save global notification record in inbox (userId: null)
      let saved = null;
      if (this.notificationRepository) {
        saved = await this.notificationRepository.create({
          userId: null,
          title: title.trim(),
          body: body.trim(),
          type,
          destination: dest,
          data,
        });
      }

      const allTokens = await this.deviceTokenRepository.listAll();
      const pushData = {
        ...data,
        notification_id: saved?.id || '',
        destination_type: dest.type,
        ...(dest.screen ? { screen: dest.screen } : {}),
        ...(dest.entityId ? { entity_id: dest.entityId } : {}),
      };

      let sent = 0;
      let failed = 0;

      if (allTokens.length > 0) {
        const results = await Promise.all(
          allTokens.map(async ({ token }) => {
            try {
              await sendPushNotification({ token, title: title.trim(), body: body.trim(), data: pushData });
              return { token, ok: true };
            } catch (error) {
              return { token, ok: false, code: error.code };
            }
          }),
        );
        sent = results.filter((r) => r.ok).length;
        failed = allTokens.length - sent;
      }

      return sendSuccess(res, {
        message: 'Broadcast push notification sent.',
        data: {
          notification: saved,
          audience,
          total_targets: allTokens.length,
          sent,
          failed,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  listCampaigns = async (req, res, next) => {
    try {
      const { page, limit } = req.query || {};
      const result = await this.notificationRepository.listCampaigns({ page, limit });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };
}
