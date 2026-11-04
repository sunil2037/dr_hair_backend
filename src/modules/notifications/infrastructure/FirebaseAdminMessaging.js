import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from '../../../config/env.js';

const firebaseAdminAppName = 'drhair-fcm';

const getFirebaseMessaging = () => {
  const { projectId, clientEmail, privateKey } = config.firebase;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  const existingApp = getApps().find((app) => app.name === firebaseAdminAppName);
  const app =
    existingApp ??
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      },
      firebaseAdminAppName,
    );

  return getMessaging(app);
};

export const sendPushNotification = async ({
  token,
  title,
  body,
  data = {},
}) => {
  if (!token) throw new Error('A Firebase device token is required.');
  if (!title && !body) {
    throw new Error('A notification title or body is required.');
  }

  const normalizedData = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value)]),
  );

  const messaging = getFirebaseMessaging();
  if (!messaging || token.startsWith('mock-') || process.env.NODE_ENV === 'test') {
    // Graceful fallback for test or dev environments where FCM service account is not yet configured,
    // or when running automated test suites with mock tokens
    return {
      simulated: true,
      messageId: `simulated-fcm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      recipient: token,
      title,
      body,
      data: normalizedData,
    };
  }

  return messaging.send({
    token,
    notification: { title, body },
    android: {
      priority: 'high',
      notification: {
        channelId: 'high_importance_channel',
        priority: 'high',
        defaultSound: true,
        defaultVibrateTimings: true,
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1,
        },
      },
    },
    ...(Object.keys(normalizedData).length > 0 ? { data: normalizedData } : {}),
  });
};
