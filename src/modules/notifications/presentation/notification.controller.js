import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { sendPushNotification } from '../infrastructure/FirebaseAdminMessaging.js';

export class NotificationController {
  constructor({
    deviceTokenRepository,
    notificationRepository,
    campaignRepository = null,
    campaignSchedulerService = null,
    auditEventRepository = null,
  }) {
    this.deviceTokenRepository = deviceTokenRepository;
    this.notificationRepository = notificationRepository;
    this.campaignRepository = campaignRepository;
    this.campaignSchedulerService = campaignSchedulerService;
    this.auditEventRepository = auditEventRepository;
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

  previewAudience = async (req, res, next) => {
    try {
      const { audience = 'All app users' } = req.query || {};
      const count = await this.deviceTokenRepository.countByAudience(audience);
      return sendSuccess(res, { data: count });
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
        scheduled_at = null,
        scheduledAt = null,
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

      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      const targetDate = scheduled_at || scheduledAt ? new Date(scheduled_at || scheduledAt) : null;
      const isFutureSchedule = targetDate && targetDate.getTime() > Date.now() + 60000;

      // Calculate audience recipients server-side
      const targetTokens = await this.deviceTokenRepository.listByAudience(audience);
      const targetCount = targetTokens.length;

      let campaign = null;
      if (this.campaignRepository) {
        campaign = await this.campaignRepository.create({
          title: title.trim(),
          body: body.trim(),
          audience,
          destination: dest,
          scheduledAt: isFutureSchedule ? targetDate : null,
          createdBy: actor,
          targetCount,
          status: isFutureSchedule ? 'scheduled' : 'draft',
        });
      }

      if (isFutureSchedule) {
        if (this.auditEventRepository?.record) {
          await this.auditEventRepository.record({
            actor,
            action: 'notification_campaign.scheduled',
            target: `campaign:${campaign?.id || 'scheduled'}`,
            metadata: { title: title.trim(), audience, scheduledAt: targetDate.toISOString(), targetCount },
          }).catch(() => null);
        }

        return sendSuccess(res, {
          message: 'Notification campaign scheduled.',
          data: {
            campaign,
            is_scheduled: true,
            status: 'Scheduled',
            scheduled_at: targetDate.toISOString(),
            audience,
            target_count: targetCount,
          },
        });
      }

      // Immediate dispatch
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

      const pushData = {
        ...data,
        campaign_id: campaign?.id || '',
        notification_id: saved?.id || '',
        destination_type: dest.type,
        ...(dest.screen ? { screen: dest.screen } : {}),
        ...(dest.entityId ? { entity_id: dest.entityId } : {}),
      };

      let sent = 0;
      let failed = 0;
      const invalidTokens = [];

      if (targetTokens.length > 0) {
        const results = await Promise.all(
          targetTokens.map(async ({ token }) => {
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
        sent = results.filter((r) => r.ok).length;
        failed = targetTokens.length - sent;
        for (const res of results) {
          if (res.invalid) invalidTokens.push(res.token);
        }
        if (invalidTokens.length > 0) {
          await this.deviceTokenRepository.removeInvalidTokens(invalidTokens).catch(() => {});
        }
      }

      const finalStatus = targetTokens.length === 0
        ? 'sent'
        : sent > 0
          ? (failed === 0 ? 'sent' : 'partial')
          : 'failed';

      if (campaign && this.campaignRepository) {
        campaign = await this.campaignRepository.markCompleted(campaign.id, {
          sentCount: sent,
          failedCount: failed,
          status: finalStatus,
        });
      }

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'notification_campaign.broadcast',
          target: `campaign:${campaign?.id || 'broadcast'}`,
          metadata: { title: title.trim(), audience, targetCount, sent, failed, status: finalStatus },
        }).catch(() => null);
      }

      return sendSuccess(res, {
        message: 'Broadcast push notification sent.',
        data: {
          campaign,
          notification: saved,
          audience,
          total_targets: targetTokens.length,
          sent,
          failed,
          status: finalStatus === 'sent' ? 'Sent' : finalStatus === 'partial' ? 'Partial' : 'Failed',
        },
      });
    } catch (error) {
      next(error);
    }
  };

  cancelCampaign = async (req, res, next) => {
    try {
      const { id } = req.params;
      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      if (!this.campaignRepository) throw new NotFoundError('Campaign management is not configured.');
      const updated = await this.campaignRepository.cancel(id, actor);
      if (!updated) throw new NotFoundError('Campaign not found.');
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'notification_campaign.cancelled',
          target: `campaign:${id}`,
          metadata: { id },
        }).catch(() => null);
      }
      return sendSuccess(res, { message: 'Campaign cancelled.', data: updated });
    } catch (error) {
      next(error);
    }
  };

  listCampaigns = async (req, res, next) => {
    try {
      const { page, limit, status, audience } = req.query || {};
      if (this.notificationRepository?.listCampaigns) {
        const legacyResult = await this.notificationRepository.listCampaigns({ page, limit });
        if (legacyResult && legacyResult.total > 0) {
          return sendSuccess(res, { data: legacyResult });
        }
      }
      if (this.campaignRepository) {
        const result = await this.campaignRepository.list({ page, limit, status, audience });
        return sendSuccess(res, { data: result });
      }
      return sendSuccess(res, { data: { items: [], total: 0, page: 1, limit: 50, hasMore: false } });
    } catch (error) {
      next(error);
    }
  };
}
