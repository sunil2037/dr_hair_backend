import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { CampaignRepository } from '../src/modules/notifications/infrastructure/CampaignRepository.js';
import { DeviceTokenRepository } from '../src/modules/notifications/infrastructure/DeviceTokenRepository.js';
import { NotificationRepository } from '../src/modules/notifications/infrastructure/NotificationRepository.js';
import { CampaignSchedulerService } from '../src/modules/notifications/application/CampaignSchedulerService.js';
import { ContentRepository } from '../src/modules/content/infrastructure/ContentRepository.js';
import { AuditEventRepository } from '../src/modules/admin/infrastructure/AuditEventRepository.js';
import { store } from '../src/shared/database/store.js';

describe('Phase 4 - Content and Notification Platform Tests', () => {
  let campaignRepo;
  let deviceTokenRepo;
  let notificationRepo;
  let contentRepo;
  let auditEventRepo;
  let schedulerService;

  beforeEach(() => {
    store.notificationCampaigns = [];
    store.contentItems = [];
    store.deviceTokens = [];
    store.notifications = [];
    store.auditEvents = [];

    campaignRepo = new CampaignRepository();
    deviceTokenRepo = new DeviceTokenRepository();
    notificationRepo = new NotificationRepository();
    contentRepo = new ContentRepository();
    auditEventRepo = new AuditEventRepository();

    schedulerService = new CampaignSchedulerService({
      campaignRepository: campaignRepo,
      deviceTokenRepository: deviceTokenRepo,
      notificationRepository: notificationRepo,
      auditEventRepository: auditEventRepo,
    });
  });

  describe('Campaign State Machine & Scheduling', () => {
    it('creates a scheduled campaign with future scheduled_at and never sends immediately', async () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour in future
      const campaign = await campaignRepo.create({
        title: 'Future Regimen Reminder',
        body: 'Do not forget your evening minoxidil application.',
        audience: 'All app users',
        scheduledAt: futureDate.toISOString(),
        createdBy: 'Dr. Specialist',
        targetCount: 15,
      });

      assert.equal(campaign.status, 'scheduled');
      assert.equal(campaign.sentCount, 0);
      assert.equal(campaign.sentAt, null);
      assert.ok(campaign.scheduledAt);

      // Verify scheduler does not pick it up before due time
      const dueNow = await campaignRepo.listDueScheduled(new Date());
      assert.equal(dueNow.length, 0);
    });

    it('cancels a scheduled campaign and prevents sending', async () => {
      const futureDate = new Date(Date.now() + 1800000);
      const campaign = await campaignRepo.create({
        title: 'Cancelled Test Campaign',
        body: 'This should be cancelled before send.',
        scheduledAt: futureDate.toISOString(),
      });

      assert.equal(campaign.status, 'scheduled');

      const cancelled = await campaignRepo.cancel(campaign.id, 'Clinic Manager');
      assert.equal(cancelled.status, 'cancelled');
      assert.ok(cancelled.errorMessage?.includes('Clinic Manager'));

      // Ensure cancelled campaign is not picked up as due
      const due = await campaignRepo.listDueScheduled(new Date(Date.now() + 7200000));
      assert.equal(due.length, 0);
    });

    it('processes due scheduled campaigns through the scheduler worker and records audit events', async () => {
      // Register device tokens
      await deviceTokenRepo.register({ userId: 101, token: 'mock-fcm-token-101', platform: 'android' });
      await deviceTokenRepo.register({ userId: 102, token: 'mock-fcm-token-102', platform: 'ios' });

      // Create a campaign whose scheduled time has passed
      const pastDate = new Date(Date.now() - 60000); // 1 minute in past
      const campaign = await campaignRepo.create({
        title: 'Weekly Scalp Check-in',
        body: 'Upload your crown photo to track hair density.',
        audience: 'All app users',
        scheduledAt: pastDate.toISOString(),
        createdBy: 'Super Admin',
      });

      assert.equal(campaign.status, 'scheduled');

      // Run scheduler worker
      await schedulerService.processDueCampaigns();

      // Verify campaign completed
      const updated = await campaignRepo.findById(campaign.id);
      assert.equal(updated.status, 'sent');
      assert.equal(updated.sentCount, 2);
      assert.ok(updated.sentAt);

      // Verify audit event was logged
      const audits = await auditEventRepo.list({ action: 'notification_campaign.dispatched' });
      assert.equal(audits.items.length, 1);
      assert.equal(audits.items[0].metadata?.title, 'Weekly Scalp Check-in');
    });

    it('calculates audience recipient counts server-side', async () => {
      await deviceTokenRepo.register({ userId: 201, token: 'tok-201', platform: 'android' });
      await deviceTokenRepo.register({ userId: 202, token: 'tok-202', platform: 'ios' });
      await deviceTokenRepo.register({ userId: 202, token: 'tok-202-tablet', platform: 'android' }); // same user 2 devices

      const preview = await deviceTokenRepo.countByAudience('All app users');
      assert.equal(preview.tokenCount, 3);
      assert.equal(preview.userCount, 2);
      assert.equal(preview.targetCount, 3);
    });
  });

  describe('Content Platform: Workflow & Provenance', () => {
    it('creates content in draft and transitions through review to published with approval metadata', async () => {
      const item = await contentRepo.create({
        type: 'tip',
        title: 'Biotin & Keratin Synthesis',
        content: 'Biotin supports intracellular keratin production in hair matrix cells.',
        placement: 'home',
        status: 'draft',
        sortOrder: 5,
      });

      assert.equal(item.status, 'draft');

      // Move to review
      const reviewing = await contentRepo.updateStatus(item.id, 'review');
      assert.equal(reviewing.status, 'review');

      // Move to published with approval audit
      const published = await contentRepo.updateStatus(item.id, 'published', {
        approved_by: 'Dr. Hair Clinical Lead',
        note: 'Approved after clinical literature cross-reference.',
      });

      assert.equal(published.status, 'published');
      assert.equal(published.provenance.approved_by, 'Dr. Hair Clinical Lead');
      assert.ok(published.provenance.approved_at);
      assert.equal(published.provenance.evidence_note, 'Approved after clinical literature cross-reference.');
    });

    it('filters published content for public endpoints while hiding drafts and unverified stories', async () => {
      // 1. Published tip
      await contentRepo.create({
        type: 'tip',
        title: 'Gentle Scalp Massage',
        content: 'Promotes microvascular circulation around dermal papillae.',
        placement: 'home',
        status: 'published',
        sortOrder: 1,
      });

      // 2. Draft tip
      await contentRepo.create({
        type: 'tip',
        title: 'Unreviewed Home Remedy',
        content: 'Draft content that must not appear in public app.',
        placement: 'home',
        status: 'draft',
        sortOrder: 2,
      });

      // 3. Story without consent verification
      await contentRepo.create({
        type: 'story',
        title: 'Unverified Patient Story',
        content: 'Story without signed consent.',
        status: 'published',
        provenance: { consent_verified: false },
      });

      // 4. Story with verified consent
      await contentRepo.create({
        type: 'story',
        title: 'Verified Regimen Journey',
        content: '6-month clinical progress with consent on file.',
        status: 'published',
        provenance: { consent_verified: true, consent_reference: 'DPDP-CONSENT-2026-088' },
      });

      const publishedTips = await contentRepo.listPublished({ type: 'tip', placement: 'home' });
      assert.equal(publishedTips.length, 1);
      assert.equal(publishedTips[0].title, 'Gentle Scalp Massage');

      const publishedStories = await contentRepo.listPublished({ type: 'story' });
      assert.equal(publishedStories.length, 1);
      assert.equal(publishedStories[0].title, 'Verified Regimen Journey');
      assert.equal(publishedStories[0].provenance.consent_reference, 'DPDP-CONSENT-2026-088');
    });
  });
});

