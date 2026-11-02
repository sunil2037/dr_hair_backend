import assert from 'node:assert/strict';
import test from 'node:test';
import { createContainer } from '../src/container.js';

test('Notification Flow & Deep Linking Endpoints', async (t) => {
  const container = createContainer();
  const { notificationController, appointmentController, cartController } = container.controllers;
  const { notificationRepository, deviceTokenRepository } = container.repositories;

  const patientUser = { id: 101, phone: '9876543210', role: 'patient' };

  await t.test('registerDeviceToken registers an FCM device token', async () => {
    let statusCode = null;
    let responseData = null;

    const req = {
      user: patientUser,
      body: {
        token: 'fcm-token-test-patient-device-abc-1234567890',
        platform: 'android',
      },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await notificationController.registerDeviceToken(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData?.message, 'Device token registered.');
    assert.equal(responseData?.data?.platform, 'android');

    const tokens = await deviceTokenRepository.listByUserId(101);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].token, 'fcm-token-test-patient-device-abc-1234567890');
  });

  await t.test('listNotifications lists patient notifications with unread count', async () => {
    let responseData = null;

    const req = {
      user: patientUser,
      query: { page: '1', limit: '10' },
    };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await notificationController.listNotifications(req, res, (err) => {
      if (err) throw err;
    });

    assert.ok(responseData?.data?.items);
    assert.equal(typeof responseData?.data?.unreadCount, 'number');
    assert.equal(responseData?.data?.page, 1);
  });

  let createdNotificationId = '';

  await t.test('sendToUser sends targeted push and saves to inbox with deep link destination', async () => {
    let responseData = null;

    const req = {
      body: {
        user_id: 101,
        title: 'Prescription Ready',
        body: 'Dr. Jai Bansal has updated your customized Redensyl protocol.',
        type: 'treatment',
        destination: {
          type: 'screen',
          screen: 'profile',
        },
        data: {
          destination_type: 'screen',
          screen: 'profile',
        },
      },
    };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await notificationController.sendToUser(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData?.message, 'Push notification delivery attempted.');
    assert.equal(responseData?.data?.target_user_id, 101);
    assert.ok(responseData?.data?.notification);
    createdNotificationId = responseData.data.notification.id;
    assert.equal(responseData.data.notification.title, 'Prescription Ready');
    assert.equal(responseData.data.notification.destination.screen, 'profile');
  });

  await t.test('markAsRead marks notification as read', async () => {
    assert.ok(createdNotificationId, 'Notification ID must exist');
    let responseData = null;

    const req = {
      user: patientUser,
      params: { id: createdNotificationId },
    };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await notificationController.markAsRead(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData?.message, 'Notification marked as read.');
    assert.equal(responseData?.data?.isRead, true);
  });

  await t.test('markAllAsRead marks all user notifications as read', async () => {
    let responseData = null;

    const req = {
      user: patientUser,
    };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await notificationController.markAllAsRead(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData?.message, 'All notifications marked as read.');

    const list = await notificationRepository.listByUserId(101);
    assert.equal(list.unreadCount, 0);
  });

  await t.test('broadcast sends push notification to audience with deep link', async () => {
    let responseData = null;

    const req = {
      body: {
        title: 'New Clinical Video Story',
        body: 'Watch how Kavita reversed diffuse thinning in 90 days.',
        audience: 'All app users',
        type: 'announcement',
        destination: {
          type: 'screen',
          screen: 'videos',
        },
        data: {
          destination_type: 'screen',
          screen: 'videos',
        },
      },
    };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await notificationController.broadcast(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData?.message, 'Broadcast push notification sent.');
    assert.equal(responseData?.data?.audience, 'All app users');
    assert.ok(responseData?.data?.notification);
    assert.equal(responseData.data.notification.destination.screen, 'videos');
  });

  await t.test('listCampaigns retrieves sent campaigns history', async () => {
    let responseData = null;

    const req = {
      query: { page: '1', limit: '10' },
    };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await notificationController.listCampaigns(req, res, (err) => {
      if (err) throw err;
    });

    assert.ok(Array.isArray(responseData?.data?.items));
    assert.ok(responseData.data.items.length >= 2);
  });

  await t.test('removeDeviceToken unregisters token on logout', async () => {
    let responseData = null;

    const req = {
      user: patientUser,
      body: {
        token: 'fcm-token-test-patient-device-abc-1234567890',
      },
    };
    const res = {
      status() {
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await notificationController.removeDeviceToken(req, res, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData?.message, 'Device token removed.');

    const remaining = await deviceTokenRepository.listByUserId(101);
    assert.equal(remaining.length, 0);
  });
});
