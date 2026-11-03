import { sendPushNotification } from '../infrastructure/FirebaseAdminMessaging.js';

export class CampaignSchedulerService {
  constructor({
    campaignRepository,
    deviceTokenRepository,
    notificationRepository,
    auditEventRepository = null,
  }) {
    this.campaignRepository = campaignRepository;
    this.deviceTokenRepository = deviceTokenRepository;
    this.notificationRepository = notificationRepository;
    this.auditEventRepository = auditEventRepository;
    this._interval = null;
    this._isProcessing = false;
  }

  async processDueCampaigns() {
    if (this._isProcessing) return;
    this._isProcessing = true;
    try {
      const now = new Date();
      const dueCampaigns = await this.campaignRepository.listDueScheduled(now);
      for (const campaign of dueCampaigns) {
        await this.dispatchCampaign(campaign);
      }
    } catch (error) {
      console.error('[CampaignSchedulerService] Error processing due campaigns:', error);
    } finally {
      this._isProcessing = false;
    }
  }

  async dispatchCampaign(campaign) {
    const processing = await this.campaignRepository.markProcessing(campaign.id);
    if (!processing) return null; // already picked up

    try {
      const tokens = await this.deviceTokenRepository.listByAudience(campaign.audience);
      const pushData = {
        campaign_id: campaign.id,
        destination_type: campaign.destination?.type || 'screen',
        ...(campaign.destination?.screen ? { screen: campaign.destination.screen } : {}),
        ...(campaign.destination?.entityId ? { entity_id: campaign.destination.entityId } : {}),
      };

      // Save global inbox notification record
      let inboxNotification = null;
      if (this.notificationRepository) {
        inboxNotification = await this.notificationRepository.create({
          userId: null,
          title: campaign.title,
          body: campaign.body,
          type: 'announcement',
          destination: campaign.destination,
          data: pushData,
        });
      }

      let sentCount = 0;
      let failedCount = 0;
      const invalidTokens = [];

      if (tokens.length > 0) {
        const results = await Promise.all(
          tokens.map(async ({ token }) => {
            try {
              await sendPushNotification({
                token,
                title: campaign.title,
                body: campaign.body,
                data: {
                  ...pushData,
                  notification_id: inboxNotification?.id || '',
                },
              });
              return { token, ok: true };
            } catch (error) {
              const invalidCodes = new Set([
                'messaging/registration-token-not-registered',
                'messaging/invalid-registration-token',
              ]);
              return { token, ok: false, invalid: invalidCodes.has(error.code) };
            }
          }),
        );

        sentCount = results.filter((r) => r.ok).length;
        failedCount = tokens.length - sentCount;
        for (const res of results) {
          if (res.invalid) invalidTokens.push(res.token);
        }

        if (invalidTokens.length > 0) {
          await this.deviceTokenRepository.removeInvalidTokens(invalidTokens).catch(() => {});
        }
      }

      const status = tokens.length === 0
        ? 'sent'
        : sentCount > 0
          ? (failedCount === 0 ? 'sent' : 'partial')
          : 'failed';

      const completed = await this.campaignRepository.markCompleted(campaign.id, {
        sentCount,
        failedCount,
        status,
      });

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor: campaign.createdBy || 'Scheduler',
          action: 'notification_campaign.dispatched',
          target: `campaign:${campaign.id}`,
          metadata: {
            title: campaign.title,
            audience: campaign.audience,
            targetCount: tokens.length,
            sentCount,
            failedCount,
            status,
          },
        }).catch(() => null);
      }

      return completed;
    } catch (error) {
      await this.campaignRepository.markCompleted(campaign.id, {
        sentCount: 0,
        failedCount: 0,
        status: 'failed',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  start(intervalMs = 30000) {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this.processDueCampaigns().catch(() => {});
    }, intervalMs);
    // Unref so timer does not prevent process exit in tests
    if (this._interval.unref) this._interval.unref();
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

